# CircleFund — Phase 1 Plan

## Context

CircleFund manages ROSCAs (Committee / Chit Fund / Samity / Tanda / Susu / Kye): groups
who pool a fixed contribution each cycle, and each cycle one member receives the whole pot.
Every member eventually wins exactly once.

This shapes every decision below. Two properties matter more than features:

1. **The draw must be provably fair.** Members are handing real money to a group. If the
   draw is merely "random," a losing member has no recourse but trust. The draw must be
   *verifiable after the fact* by a suspicious participant.
2. **The money math must never drift.** No floats, no editable payment rows, no derived
   balance that can disagree with its ledger.

The original spec listed ~120 features across 20 sections. That is a multi-month team effort;
attempting it in one pass produces plausible-looking screens over stubs — the worst possible
outcome for software that tracks other people's savings. **Phase 1 builds the core money path
properly.** Everything else is explicitly deferred, not silently dropped.

## Decisions locked (from Q&A)

| Decision | Choice |
|---|---|
| Phase 1 scope | Core money path: schema, auth/RBAC/audit, Committees, Members, Payments, Draw engine + wheel |
| Database | Supabase (new project — **not** the existing "Cafeteria ERP") |
| Tenancy | True multi-tenant, `organizationId` scoped at the data layer |
| Integrations | Provider interfaces + no-op/log adapters; no fake third-party code |
| Language | App code 100% JavaScript; Prisma's generated client stays TS (build artifact, never edited) |
| Auth | Auth.js v5 beta, isolated behind our own session/RBAC layer so it stays swappable |

## Stack reality — verified, not assumed

I checked these against the registry and official docs. Several contradict the tutorials that
Google will surface, so they're recorded here to avoid re-litigating them mid-build.

- **Next.js 16.2.10 / React 19.2.7.** `middleware.js` → **`proxy.js`** (named export `proxy`;
  Node runtime only, no edge). `params`/`searchParams`/`cookies`/`headers` are **async-only** —
  the sync fallback is gone. Turbopack is default. `revalidateTag` now needs a second arg;
  `updateTag` is the new read-your-writes API for Server Actions. `next lint` removed. Node ≥20.9.
- **Prisma 7.8.0** is a rewrite: driver adapter (`@prisma/adapter-pg`) **mandatory**, ESM-only
  (`"type": "module"`), `output` required, no more `@prisma/client` import, **`$use` middleware
  removed** → Client Extensions are the only interception point. This last one directly
  determines the tenancy and audit design below.
- **Auth.js v5 beta-31.** Its published patterns predate the `proxy` rename; I adapt them rather
  than copy them.
- **Tailwind 4.3.2** (CSS-first, no `tailwind.config.js`) + **shadcn/ui** — supported on React 19.
- Recharts 3.9.2, Zod 4.4.3, RHF 7.81, TanStack Query 5.101, motion 12.42.

**Known risk:** Prisma 7 + Next 16 + Turbopack has a reported module-resolution bug. Mitigation
is stage 1's gate — if it bites, fall back to `next build --webpack` or pin Prisma 6. I'd rather
hit this in hour one than hour forty.

## Architecture

Feature-based, clean-architecture layering. Dependencies point inward; `app/` stays thin.

```
src/
  app/                     # routes only — parse input, call action, render
  features/<feature>/      # committees | members | payments | draws
      components/          #   UI
      actions.js           #   'use server' — authz + validation boundary
      service.js           #   business rules, transactions, audit
      repository.js        #   the ONLY place Prisma is touched
      schema.js            #   Zod (shared client+server)
      dto.js               #   BigInt→string, Date→ISO at the RSC boundary
      hooks.js             #   React Query
  core/
      db/           prisma.js, tenant.js   # Client Extension: org scoping
      auth/         authjs config, session, rbac.js, permissions.js
      money/        integer-minor-unit math
      draw/         rng.js, engine.js      # the verifiable draw
      audit/        same-transaction audit writer
      notifications/  NotificationChannel interface + LogChannel adapter
      result.js     Result<Ok,Err> — no throwing across layers
  components/ui/           # shadcn primitives
```

**Reusable primitives built once, used everywhere** (the spec asks for these repeatedly):
`<DataTable>` (pagination/sort/filter via URL search params), `<FormDialog>`, `<ConfirmDialog>`,
`<EmptyState>`, `<PageSkeleton>`, `useTableQuery`, `withAuth(permission)` action wrapper.

### Three cross-cutting mechanisms

**1. Tenancy — enforced in the data layer, not remembered by developers.**
A Prisma **Client Extension** (`core/db/tenant.js`) wraps every query to inject
`where: { organizationId }`. A forgotten filter becomes impossible rather than a leak.
Repositories take a scoped client; they cannot construct an unscoped one.
*(Client Extensions — not `$use` — because Prisma 7 deleted middleware.)*
Postgres RLS is deliberately deferred to Phase 2 as defence-in-depth; it needs
`SET LOCAL` inside every transaction and I won't half-do it.

**2. Money — integers only.**
Stored as `BigInt` **minor units** (paisa/cents) + ISO currency + exponent. No float ever
touches an amount. `core/money` owns all arithmetic; `dto.js` converts `BigInt → string` at the
serialization boundary (BigInt isn't JSON-serializable — the DTO layer the spec already asked
for is exactly the right place for this).
Payments are an **append-only ledger**: corrections are reversal entries, never edits.
Paid/Due/Late/Advance are *derived* from the ledger, never stored — so they cannot disagree
with it. (Denormalize later only if measurement demands it.)

**3. Audit — in the same transaction as the mutation.**
`writeAudit` runs inside the mutation's transaction. If the audit write fails, the mutation
rolls back. An audit log that can silently drop entries is worse than none.

## The draw engine (`core/draw`) — the part worth getting right

A plain `crypto.randomInt()` is secure but **unverifiable**: a member who loses cannot check it
was honest. So the draw is **commit–reveal**:

1. **Before** the draw, generate `serverSeed` (32 bytes, `crypto.randomBytes`) and publish
   `commitment = SHA256(serverSeed)`. Freeze the eligible-member list, ordered, into the record.
2. **At** the draw, derive the winner index deterministically:
   `HMAC-SHA256(serverSeed, drawId || cycleNumber)` → **rejection sampling** (not modulo, which
   biases toward low indices) → index into the frozen eligible list.
3. **After**, reveal `serverSeed`. Anyone recomputes `SHA256(serverSeed)` and the index, and
   confirms the winner. Cheating requires breaking SHA-256 or predicting the seed before commit.

Stored per draw: `commitment`, `serverSeed`, frozen eligible list, `algorithmVersion`, derived
index, winner, admin, override reason. `algorithmVersion` means old draws stay verifiable after
the algorithm changes.

**"Video/Animation Replay" is satisfied by deterministic replay, not video files.** Seed +
frozen list re-runs the identical wheel animation on demand. No storage, no transcoding, and it
doubles as the fairness proof.

**Invariants enforced by the database, not just code:**
- `UNIQUE(committeeId, cycleNumber)` — a cycle can never be drawn twice, even under a race.
- `UNIQUE(committeeId, winnerMemberId)` — "never select someone who already received" becomes
  physically impossible, not merely checked.
- Draw runs in a transaction with `SELECT … FOR UPDATE` on the committee row.
- Payment-completeness gate; admin override allowed but **requires a reason** and is audited.

## Schema (11 models, all `organizationId`-scoped, all soft-deleted via `deletedAt`)

`Organization`, `User`, `Membership` (user↔org+role), `Member`, `Committee`,
`CommitteeMember` (position, drawOrder, hasReceived), `Payment` (append-only),
`Draw`, `Transaction`, `Receipt`, `Notification`, `AuditLog`, `Setting`.

Roles: `SUPER_ADMIN` (cross-org), `ORG_OWNER`, `MANAGER`, `MEMBER`.
RBAC is **permission-based**, not scattered role checks: a `PERMISSIONS` map, roles → permission
sets, and `can(session, permission, resource)` enforced in the **service layer** — UI hiding is
cosmetic, never the control.

## Phase 1 stages — each ends at a gate I stop and verify

1. **Scaffold + Prisma 7 smoke test.** Next 16 + Tailwind 4 + shadcn, JS. Create Supabase
   project (`ap-southeast-1`/Singapore — say the word if you want another region), wire pooler
   `DATABASE_URL` + direct `DIRECT_URL`, prove one real query round-trips through
   `@prisma/adapter-pg` under Turbopack.
   → **Gate: the Turbopack/Prisma risk is settled before anything is built on it.**
2. **Schema + migration + seed.** All 11 models, constraints, indexes. Migrate to Supabase.
   → **Gate: I stop here for your review — everything else depends on this.**
3. **Auth + RBAC + audit + tenancy extension.** Auth.js v5 on `proxy.js`, permission matrix,
   same-transaction audit, org-scoping extension. Tested before any feature can bypass it.
4. **Members + Committees.** Full CRUD through the reusable `DataTable`/`FormDialog` stack.
5. **Payments.** Append-only ledger, late-fee/grace rules, derived status, printable receipt.
6. **Draw engine + wheel.** Engine and its tests first, animation second — the fairness proof
   is the product; the confetti is decoration.

## Explicitly NOT in Phase 1

So there's no ambiguity about what "done" means: Reports/exports (PDF/Excel/CSV), Calendar,
Member Portal, Notifications delivery (interface only), Admin settings/theming/i18n, backup/restore,
PWA/offline, real-time, QR/bKash/Nagad/Rocket, digital signature, AI assistant, voice search,
OCR, live TV draw screen, attendance, e-signatures, photo/video archive.

The architecture leaves seams for each (notably `NotificationChannel`, and the draw's replay
already covers the "archive" need). These are Phase 2+.

## Verification — how we'll know it actually works

Not "it compiles." Each is a real check:

- **Draw fairness (the critical one):** 100k simulated draws → chi-square uniformity test
  (catches modulo bias); assert zero repeat winners across a full committee lifecycle; assert
  every revealed seed verifies against its commitment; assert a completed committee has every
  member winning exactly once.
- **Money:** property tests — contributions minus payouts always reconcile to zero across a full
  committee; no float appears in any amount path; reversal entries restore prior balance exactly.
- **Tenancy:** attempt cross-org reads/writes with a scoped client and assert they return empty
  or fail — the leak test must actively fail before the extension is trusted.
- **RBAC:** table-driven test over every (role × permission) pair, asserted at the service layer.
- **Concurrency:** fire two simultaneous draws at one committee; assert exactly one succeeds.
- **End-to-end:** run the dev server and drive it — seed an org, create a committee, add members,
  record payments, run a draw, verify the wheel and the receipt. I'll report what I actually
  observed, including anything that fails.

Vitest for units; migrations verified against the real Supabase database, not a mock.

## Open items

- **Supabase project creation** is a real (free, $0/mo) resource in your org. I'll create
  `circlefund` and generate a strong random DB password into gitignored `.env.local`.
  I will not touch "Cafeteria ERP".
- Region defaults to Singapore given the bKash/Nagad/Rocket context; correct me if wrong.