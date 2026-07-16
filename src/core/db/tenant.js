/**
 * Tenant scoping.
 *
 * Every tenant table carries organizationId. Rather than trusting each query author
 * to remember `where: { organizationId }`, this wraps the client so the filter is
 * injected automatically. A forgotten filter stops being a data breach and becomes
 * impossible to express.
 *
 * Implemented as a Prisma Client Extension because Prisma 7 removed `$use`
 * middleware. Extensions are now the only interception point — most tutorials
 * showing `prisma.$use(...)` are describing a version that no longer exists.
 *
 * Relies on Prisma's extended-where-unique support: `findUnique`/`update`/`delete`
 * accept extra non-unique filters alongside the unique one, so an id lookup for
 * another org's row returns null instead of that row.
 *
 * USAGE — always go through this:
 *     const db = forOrganization(actor.organizationId);
 *     await db.committee.findMany();   // implicitly scoped
 *
 * Note: this extension handles tenancy ONLY. Soft-delete filtering (`deletedAt`)
 * stays explicit in repositories — a hidden deletedAt filter would make "why is my
 * row missing?" much harder to debug, and showing a soft-deleted row is a bug,
 * not a breach.
 */
import { prisma } from "./prisma";
import { MissingTenantScopeError } from "@/core/errors";

/**
 * Models carrying an `organizationId` column.
 * User/Account/Session/VerificationToken are deliberately absent: identity is
 * global, and a user may belong to several organizations.
 */
const TENANT_MODELS = new Set([
  "Membership",
  "Member",
  "Committee",
  "CommitteeMember",
  "Payment",
  "Draw",
  "Transaction",
  "Receipt",
  "Notification",
  "AuditLog",
  "Setting",
  "MemberPaymentAccount",
]);

/**
 * Operations addressing a single row by unique key. Prisma requires the unique
 * field at the top level of `where`, so the scope is merged in beside it rather
 * than wrapped in an AND (which would break the unique constraint requirement).
 *
 * Merging is safe here precisely because the unique key dominates: a row id
 * belongs to exactly one organization, so `{id: X, organizationId: ours}` either
 * matches our row or matches nothing.
 */
const UNIQUE_WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "delete",
]);

/**
 * Operations taking an arbitrary filter. These are AND-ed rather than merged.
 *
 * This distinction is not cosmetic. Merging would let a caller's own
 * `organizationId` be *replaced* by ours — so `deleteMany({where: {organizationId:
 * theirOrg}})` would quietly become `deleteMany({where: {organizationId: ourOrg}})`
 * and delete OUR rows instead of matching none. A cross-tenant mistake must do
 * nothing, not something destructive to the caller. (A test caught exactly this.)
 */
const FILTER_WHERE_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
  "aggregate",
  "count",
  "groupBy",
]);

/** Operations whose `data` we stamp. */
const DATA_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

function stampData(data, organizationId) {
  if (Array.isArray(data)) {
    return data.map((row) => ({ ...row, organizationId }));
  }
  return { ...data, organizationId };
}

/**
 * Append `scope` to a where clause's AND list, leaving the caller's own fields
 * untouched.
 *
 * Never overwrite a caller's field. If a caller asks for `{id: X}` where X belongs
 * to another org, the honest answer is "no such row" — not "here's our row with
 * that field replaced". Overwriting turns a cross-tenant read into silently wrong
 * data, and a cross-tenant delete into a destructive one against our own rows.
 * Both were real, and both were caught by tests/tenancy.test.js.
 *
 * Top-level fields are preserved so Prisma still sees the unique key that
 * findUnique/update/delete require.
 */
function andScope(where, scope) {
  const existing = where?.AND;
  const andList = Array.isArray(existing)
    ? existing
    : existing
      ? [existing]
      : [];

  return { ...where, AND: [...andList, scope] };
}

/**
 * Returns a Prisma client permanently scoped to one organization.
 * @param {string} organizationId
 */
export function forOrganization(organizationId) {
  if (!organizationId || typeof organizationId !== "string") {
    throw new MissingTenantScopeError("*", "forOrganization");
  }

  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // The Organization row itself is identified by `id`, not `organizationId`.
          if (model === "Organization") {
            const scope = { id: organizationId };
            if (UNIQUE_WHERE_OPS.has(operation)) {
              args.where = andScope(args.where, scope);
            } else if (FILTER_WHERE_OPS.has(operation)) {
              args.where = { AND: [args.where ?? {}, scope] };
            }
            return query(args);
          }

          if (!TENANT_MODELS.has(model)) {
            return query(args);
          }

          const scope = { organizationId };

          if (UNIQUE_WHERE_OPS.has(operation)) {
            // AND-ed, not merged: a caller asking for another org's row by id gets
            // null, rather than our row with the id swapped underneath them.
            args.where = andScope(args.where, scope);
          } else if (FILTER_WHERE_OPS.has(operation)) {
            args.where = { AND: [args.where ?? {}, scope] };
          } else if (DATA_OPS.has(operation)) {
            args.data = stampData(args.data, organizationId);
          } else if (operation === "upsert") {
            args.where = andScope(args.where, scope);
            args.create = { ...args.create, organizationId };
          }

          return query(args);
        },
      },
    },
  });
}

/**
 * Escape hatch for the few genuinely cross-tenant operations: authentication,
 * super-admin tooling, and the org-picker. Named to be conspicuous in review —
 * if this shows up inside a feature, that's a bug.
 */
export function unscopedDb() {
  return prisma;
}
