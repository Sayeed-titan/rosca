# CircleFund — User Manual

CircleFund runs rotating savings committees — what you may call a **Committee, Chit
Fund, Samity, ROSCA, Tanda, Susu or Kye**.

The idea is simple. A group agrees on an amount. Everyone pays it every month. Each
month one person receives the whole pot. When everyone has had a turn, the committee
ends and nobody is up or down.

The hard part was never the maths. It's **trust** — was the draw honest, and do the
books add up? CircleFund is built around those two questions.

---

## 1. Starting the app

```bash
npm install
npm run dev
```

Open **http://localhost:3000**.

### Demo accounts

Password for all: **`Password123!`**

| Email | Role | What they can do |
|---|---|---|
| `owner@circlefund.dev` | Organization Owner | Everything |
| `manager@circlefund.dev` | Manager | Day-to-day, but cannot reverse payments or override a draw |
| `member@circlefund.dev` | Member | View their own records only |
| `super@circlefund.dev` | Super Admin | Platform operator, across all organizations |

> **Change these before real use.** They are demo data with a published password.

---

## 2. Who can do what

Roles are not decoration — the server enforces them, so hiding a button is not what
stops anyone.

| Action | Owner | Manager | Member |
|---|:--:|:--:|:--:|
| View committees, members, payments, draws | ✅ | ✅ | own only |
| Add / edit members | ✅ | ✅ | ❌ |
| Create / edit committees | ✅ | ✅ | ❌ |
| Assign seats | ✅ | ✅ | ❌ |
| Record a payment | ✅ | ✅ | ❌ |
| **Reverse a payment** | ✅ | ❌ | ❌ |
| Run a draw | ✅ | ✅ | ❌ |
| **Override the payment rule** | ✅ | ❌ | ❌ |
| Delete a member | ✅ | ❌ | ❌ |
| View the audit log | ✅ | ❌ | ❌ |
| Change settings | ✅ | ❌ | ❌ |

**Why Managers can't reverse or override:** the person collecting the money should
not also be able to unwind it, or to waive the rule that protects it. That
separation is deliberate, not an oversight.

---

## 3. Run your first committee — start to finish

### Step 1 — Add the people (`Members`)

**Members → Add member.**

Required: **Name** and **Phone**. Everything else is optional.

- **National ID** must be unique in your organization. Leave it blank if you don't
  have it — blanks don't clash with each other.
- A member is *not* a login. Most people in a committee never sign in; you record
  them. A login is only linked if you give them portal access later.

### Step 2 — Create the committee (`Committees`)

**Committees → New committee.**

| Field | What it means |
|---|---|
| **Amount per member, per cycle** | What one **seat** pays each cycle. Type `5000` or `5000.50`. |
| **Total seats** | How many seats — **and therefore how many cycles**. 8 seats = 8 months = 8 payouts. |
| **Start date** | When cycle 1 is due. |
| **Draw frequency** | Monthly or Weekly. |
| **Draw day** | Monthly: day of month (1–31). Weekly: 1 = Monday … 7 = Sunday. |
| **Grace period** | Days after the due date before a payment counts as late. |
| **Late fee** | None, a flat amount, or a percentage of the contribution. |
| **Status** | Start as **Draft**; switch to **Active** when you're ready to collect. |

> **Seats, not people.** 8 seats does not mean 8 people — see Step 3.

### Step 3 — Assign seats

**Click the committee row** to open it, then **Assign seats**.

This is where **one member can take more than one seat**, exactly as in a real
committee. Someone taking 2 shares:

- pays the contribution **twice every cycle**, and
- receives the pot on **two** of the cycles.

So an 8-seat committee might be 5 people: one with 3 seats, one with 2, three with 1.

The dialog spells the commitment out before you confirm, because doubling someone's
monthly obligation should never be an accident.

> **Fill every seat before the first draw.** The app refuses to draw on a half-empty
> roster — the pot and the schedule wouldn't add up.

> **The roster locks after the first draw.** Adding a seat later would change the pot
> everyone already paid into, and quietly worsen the odds of anyone already drawn
> against.

### Step 4 — Collect (`Payments`)

**Payments → Record payment.**

Choose the committee, then the **seat** (shown as `#3 · Rahima Akter`). A member with
two seats appears twice — pay each separately, because each seat owes separately.

- **Amount** pre-fills with the expected contribution. Change it for a partial payment.
- **Method** includes bKash, Nagad, Rocket, bank, cash and card. Put the TrxID in
  **Reference**.
- **Late fee** is calculated automatically from the committee's rule and the grace
  period. Leave **Late fee override** blank unless you're deliberately waiving it —
  overrides are recorded in the audit trail with your name on them.

A **receipt** is created automatically. Find it under the row's ⋯ menu → **View
receipt** → **Print**.

### Step 5 — Draw a winner (`Draws`)

**Draws → choose the committee → Run draw.**

You'll see the pot, who's eligible, and whether the cycle is fully collected.

- **If everyone has paid:** press **Draw winner**. The wheel spins, and the winner is
  announced with confetti.
- **If someone still owes:** the app **refuses**, and names who is short. Nobody
  should take the pot while others are still paying into it. An **Owner** may
  override with a written reason, which is permanently audited and shown on the draw
  forever.

### Step 6 — Check the draw was honest (`Draws → Verify`)

This is the part that matters most, and anyone who can see a draw can press it.

**How the fairness works, in plain terms:**

1. **Before** the draw, the app generates a secret number (the *seed*) and publishes
   its fingerprint (a SHA-256 hash). The fingerprint is locked in before anybody
   knows the winner.
2. The winner is worked out **from that seed** by a fixed calculation.
3. **After** the draw, the seed is revealed.
4. Anyone can now check the seed matches the fingerprint published beforehand, redo
   the calculation, and confirm the same winner.

To fake a result, an organiser would have to find a different seed producing the same
fingerprint — that means breaking SHA-256. **Even someone with full access to the
database cannot forge a draw that passes verification.** We test exactly that.

Press **Verify** on any draw. Green means honest. Red means the record was tampered
with.

---

## 4. Everyday tasks

### Fixing a payment mistake

**You cannot edit or delete a payment.** That's on purpose — an editable ledger is a
ledger that can lie.

Instead: ⋯ → **Reverse payment**, and give a reason. This adds an equal-and-opposite
entry. The original stays visible, the balances correct themselves, and the reason is
recorded. (Owner only.)

Typical reasons: cheque bounced, recorded against the wrong member, entered twice.

### Someone paid late

Nothing to do. If the payment date is past the due date **plus** the grace period, the
late fee is applied automatically from the committee's rule.

To waive it, type `0` in **Late fee override**. It will be audited.

### Someone wants to leave

- **Before any payments:** open the committee, remove their seat.
- **After payments:** you can't remove the seat — that would orphan real money.
  Reverse the payments first if they were errors, or mark the member Inactive.

### Reading the roster

| Column | Meaning |
|---|---|
| **Seat** | Seat number. A member may hold several. |
| **Received pot?** | Whether this **seat** has taken its payout, and in which cycle. |
| **Paid** | Total received against this seat, net of reversals. |
| **Outstanding** | What's **due now and unpaid**. Future cycles are not counted — you don't owe next month yet. |
| **Remaining** | Installments still to pay. |

---

## 5. Understanding the dashboard

| Tile | Meaning |
|---|---|
| **Money collected** | Everything received, minus reversals. |
| **Outstanding** | Due to date and not received. Not future installments. |
| **Per-cycle target** | One full cycle's pot across active committees. |
| **Upcoming draw** | The next due date. |
| **Draws run** | Every one is verifiable from its seed. |

---

## 6. Rules the app enforces (and won't let you break)

These are guaranteed by the **database**, not just by code — so they hold even if the
app has a bug:

1. **A cycle can only be drawn once.** Two people clicking "Draw" at the same instant
   cannot both succeed.
2. **A seat can only win once.** A 2-seat member wins twice — once per seat — never
   three times.
3. **Seat numbers can't collide.**

Enforced by the app, with a reason given:

4. The pot must be fully collected before a draw (Owner may override, with a reason).
5. The roster must be full before the first draw.
6. The roster locks once drawing starts.
7. A committee's amount and seat count freeze once money has moved.
8. A member in an active committee can't be deleted.
9. A payment can never be edited or deleted — only reversed.

---

## 7. Money — why you can trust the arithmetic

Amounts are stored as whole **paisa**, never as decimals. Computers get decimals
subtly wrong: `2500.75 × 6` in ordinary arithmetic gives `15004.499999999998`.
CircleFund stores `250075` paisa and multiplies to exactly `1500450` — **৳15,004.50**,
every time.

Late fee percentages work the same way: 2.5% is stored as the whole number `250`
(basis points), not `0.025`.

Over a committee's life this is the difference between books that balance and books
that quietly drift.

---

## 8. What is not built yet

Being straight with you, so you don't go looking:

- **Reports and exports** (PDF / Excel / CSV)
- **Calendar** view
- **Member portal** — members can't sign in to see their own records yet
- **Notifications** — email, SMS, WhatsApp, push (the seam exists; nothing sends)
- **Settings screen** — theme, language, logo, backup/restore
- **QR payments**, digital signatures, photo upload
- **PWA / offline**, real-time updates
- **AI assistant, voice search, OCR**

The sidebar shows **Reports** and **Settings** greyed out with a "Soon" tag rather
than hiding them, so the shape of the product is visible without pretending.

**Also honest:** login rate-limiting is in-memory only. It slows one attacker on one
server, but is not a real control. It needs a shared backend (Redis or Postgres)
before production.

---

## 9. Before you use this for real money

1. **Change every demo password**, and delete the demo accounts.
2. **Rotate the database password** — the current one appeared in a chat transcript.
   It is a development credential, not a secret.
3. **Replace the login rate-limiter** with a shared-state one.
4. **Set a fresh `AUTH_SECRET`** in production (`npx auth secret`).
5. **Take backups.** Supabase does this, but confirm it.
6. Deploy with `npm run build && npm start`, or push to Vercel. Migrations run with
   `npx prisma migrate deploy` (not `migrate dev`).

---

## 10. Quick reference

```bash
npm run dev          # start the app
npm run build        # production build
npm test             # run the full test suite (213 tests)
npm run db:studio    # browse the database
npm run db:seed      # reload demo data
npx prisma migrate deploy   # apply migrations in production
```

| Page | Purpose |
|---|---|
| `/dashboard` | Totals, upcoming draw, recent activity |
| `/members` | Everyone in your organization |
| `/committees` | All committees — **click a row for its roster** |
| `/committees/[id]` | Seats, payment status, who's received |
| `/payments` | Record payments, print receipts, reverse mistakes |
| `/draws` | Run draws, view history, **verify fairness** |
| `/api/health/db` | Is the database reachable? |
