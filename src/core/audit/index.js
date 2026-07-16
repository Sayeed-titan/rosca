/**
 * Audit trail.
 *
 * The rule: audit is written INSIDE the same transaction as the mutation it
 * describes. Pass the transaction client, not the global one.
 *
 *     await db.$transaction(async (tx) => {
 *       const payment = await tx.payment.create({ data });
 *       await writeAudit(tx, { action: AuditAction.PAYMENT_CREATE, ... });
 *       return payment;
 *     });
 *
 * If the audit insert fails, the payment rolls back too. That is deliberate: an
 * audit log that silently drops entries is worse than no audit log, because it
 * looks authoritative while lying. For money, refusing the write is the right
 * failure mode.
 */

export const AuditAction = {
  LOGIN: "auth.login",
  LOGIN_FAILED: "auth.login_failed",
  LOGOUT: "auth.logout",

  MEMBER_CREATE: "member.create",
  MEMBER_UPDATE: "member.update",
  MEMBER_DELETE: "member.delete",
  MEMBER_PAYMENT_ACCOUNT_SAVE: "member.payment_account_save",
  MEMBER_PAYMENT_ACCOUNT_REMOVE: "member.payment_account_remove",

  COMMITTEE_CREATE: "committee.create",
  COMMITTEE_UPDATE: "committee.update",
  COMMITTEE_DELETE: "committee.delete",
  COMMITTEE_ASSIGN_MEMBER: "committee.assign_member",

  PAYMENT_CREATE: "payment.create",
  PAYMENT_BULK_CREATE: "payment.bulk_create",
  PAYMENT_REVERSE: "payment.reverse",
  RECEIPT_ISSUE: "receipt.issue",

  DRAW_RUN: "draw.run",
  DRAW_OVERRIDE: "draw.override",

  SETTINGS_UPDATE: "settings.update",
  ORG_MEMBER_ROLE_CHANGE: "org.member_role_change",
};

/**
 * Field names that must never reach the audit table. Audit logs get read widely
 * (support, exports, compliance) — they are exactly the wrong place for secrets.
 */
const REDACTED_KEYS = new Set([
  "password",
  "passwordHash",
  "newPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refresh_token",
  "access_token",
  "id_token",
  "sessionToken",
  "serverSeed", // pre-reveal only; the draw reveals it deliberately elsewhere
  "secret",
  "authSecret",
]);

/**
 * Deep-copies a value, replacing sensitive fields with "[redacted]" and making it
 * JSON-safe. BigInt is stringified because JSON cannot represent it — the same
 * reason money crosses our DTO boundary as a string.
 */
export function redact(value, depth = 0) {
  if (value === null || value === undefined) return value ?? null;
  if (depth > 8) return "[truncated]";

  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACTED_KEYS.has(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }

  return value;
}

/**
 * @param {object} client  a Prisma transaction client (preferred) or db client
 * @param {object} entry
 * @param {string} entry.action        one of AuditAction
 * @param {string} [entry.organizationId]  omit for platform-level events
 * @param {string} [entry.actorUserId]     omit for anonymous events (failed login)
 * @param {string} [entry.entityType]
 * @param {string} [entry.entityId]
 * @param {object} [entry.before]
 * @param {object} [entry.after]
 * @param {string} [entry.ipAddress]
 * @param {string} [entry.userAgent]
 */
export async function writeAudit(client, entry) {
  if (!entry?.action) {
    throw new Error("writeAudit requires an action");
  }

  const data = {
    action: entry.action,
    actorUserId: entry.actorUserId ?? null,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    before: entry.before === undefined ? null : redact(entry.before),
    after: entry.after === undefined ? null : redact(entry.after),
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
  };

  // A scoped client stamps organizationId itself; an unscoped one (auth events)
  // needs it passed, and it may legitimately be null for platform-level actions.
  if (entry.organizationId !== undefined) {
    data.organizationId = entry.organizationId;
  }

  return client.auditLog.create({ data });
}
