import "server-only";

/**
 * Committee data access. Every function takes an already-scoped `db`.
 */

const LIST_SELECT = {
  id: true,
  name: true,
  description: true,
  contributionMinor: true,
  currency: true,
  currencyExponent: true,
  totalSeats: true,
  startDate: true,
  endDate: true,
  drawFrequency: true,
  drawDay: true,
  gracePeriodDays: true,
  lateFeeType: true,
  lateFeeFlatMinor: true,
  lateFeePercentBps: true,
  status: true,
  createdAt: true,
  _count: {
    select: {
      members: { where: { deletedAt: null } },
      draws: true,
    },
  },
};

function buildWhere({ q, status }) {
  const where = { deletedAt: null };
  if (status && status !== "ALL") where.status = status;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function listCommittees(db, { page, pageSize, q, sort, dir, status }) {
  const where = buildWhere({ q, status });

  const [rows, total] = await Promise.all([
    db.committee.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { [sort]: dir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.committee.count({ where }),
  ]);

  return { rows, total };
}

export async function findCommitteeById(db, id) {
  return db.committee.findUnique({ where: { id }, select: LIST_SELECT });
}

export async function findCommitteeByName(db, name) {
  return db.committee.findFirst({
    where: { name, deletedAt: null },
    select: { id: true, name: true },
  });
}

export async function createCommittee(db, data) {
  return db.committee.create({ data, select: LIST_SELECT });
}

export async function updateCommittee(db, id, data) {
  return db.committee.update({ where: { id }, data, select: LIST_SELECT });
}

/** Soft delete — draws and payments reference this committee. */
export async function softDeleteCommittee(db, id) {
  return db.committee.update({
    where: { id },
    data: { deletedAt: new Date(), status: "CANCELLED" },
    select: LIST_SELECT,
  });
}

/** Draws already run. A committee with history must not be casually deleted. */
export async function countDraws(db, committeeId) {
  return db.draw.count({ where: { committeeId } });
}

export async function countPayments(db, committeeId) {
  return db.payment.count({ where: { committeeId } });
}

/** Active seats right now — the value totalSeats must always agree with pre-draw. */
export async function countSeats(db, committeeId) {
  return db.committeeMember.count({ where: { committeeId, deletedAt: null } });
}
