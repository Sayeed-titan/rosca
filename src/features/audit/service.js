import "server-only";

/**
 * Audit trail reads.
 *
 * The write side (core/audit) is the important half — this just presents what it
 * recorded. Read-only by design: the audit log has no update or delete path
 * anywhere in the app, because a trail that can be edited proves nothing.
 */

const LIST_SELECT = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  before: true,
  after: true,
  ipAddress: true,
  createdAt: true,
  actor: { select: { name: true, email: true } },
};

export async function listAuditLogs(db, { page, pageSize, action, actorUserId, q }) {
  const where = {};

  if (action && action !== "ALL") {
    // Prefix match so "payment" catches payment.create, payment.reverse, etc —
    // filtering by exact action would need the user to know our naming scheme.
    where.action = { startsWith: action };
  }
  if (actorUserId && actorUserId !== "ALL") {
    where.actorUserId = actorUserId;
  }
  if (q) {
    where.OR = [
      { action: { contains: q, mode: "insensitive" } },
      { entityType: { contains: q, mode: "insensitive" } },
      { entityId: { contains: q, mode: "insensitive" } },
      { actor: { name: { contains: q, mode: "insensitive" } } },
      { actor: { email: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.auditLog.count({ where }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      // Already redacted and JSON-safe at write time (see core/audit redact()).
      before: r.before,
      after: r.after,
      ipAddress: r.ipAddress,
      createdAt: r.createdAt.toISOString(),
      actorName: r.actor?.name ?? r.actor?.email ?? "System",
      actorEmail: r.actor?.email ?? null,
    })),
    total,
  };
}

/** Distinct actors, for the filter dropdown. */
export async function listAuditActors(db) {
  const rows = await db.auditLog.findMany({
    where: { actorUserId: { not: null } },
    select: { actorUserId: true, actor: { select: { name: true, email: true } } },
    distinct: ["actorUserId"],
    take: 100,
  });

  return rows
    .filter((r) => r.actor)
    .map((r) => ({
      id: r.actorUserId,
      label: r.actor.name ?? r.actor.email,
    }));
}
