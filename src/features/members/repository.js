import "server-only";

/**
 * Member data access — the only file that knows Prisma's query shapes for members.
 *
 * Every function takes an already-scoped `db` (from forOrganization). None of them
 * accept an organizationId: the scope is the caller's, not a parameter that could
 * be passed wrong.
 *
 * Soft delete is explicit here (`deletedAt: null`) rather than hidden in the tenant
 * extension. Hiding it would make "why is my row missing?" much harder to debug,
 * and unlike tenancy, accidentally showing a deleted row is a bug rather than a
 * data breach.
 */

const LIST_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  email: true,
  nationalId: true,
  occupation: true,
  status: true,
  joiningDate: true,
  createdAt: true,
  userId: true,
  _count: { select: { committeeMembers: { where: { deletedAt: null } } } },
};

function buildWhere({ q, status }) {
  const where = { deletedAt: null };

  if (status && status !== "ALL") {
    where.status = status;
  }

  if (q) {
    // Search the fields an organiser actually has to hand when someone walks in.
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { nationalId: { contains: q, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function listMembers(db, { page, pageSize, q, sort, dir, status }) {
  const where = buildWhere({ q, status });

  // Count and page in one round trip. The count must use the same `where`, or the
  // pagination controls will disagree with the rows.
  const [rows, total] = await Promise.all([
    db.member.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { [sort]: dir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.member.count({ where }),
  ]);

  return { rows, total };
}

export async function findMemberById(db, id) {
  return db.member.findUnique({
    where: { id },
    select: { ...LIST_SELECT, address: true, emergencyContact: true, photoUrl: true, notes: true },
  });
}

export async function findMemberByNationalId(db, nationalId) {
  if (!nationalId) return null;
  return db.member.findFirst({
    where: { nationalId, deletedAt: null },
    select: { id: true, fullName: true },
  });
}

export async function createMember(db, data) {
  return db.member.create({ data });
}

export async function updateMember(db, id, data) {
  return db.member.update({ where: { id }, data });
}

/**
 * Soft delete. The row stays, because payments and draw history reference this
 * member and a hard delete would either cascade away financial history or fail on
 * a foreign key. Deleting a person must never delete the money record of what they
 * paid.
 */
export async function softDeleteMember(db, id) {
  return db.member.update({
    where: { id },
    data: { deletedAt: new Date(), status: "INACTIVE" },
  });
}

/** Active committee seats — used to block deleting someone mid-committee. */
export async function countActiveSeats(db, memberId) {
  return db.committeeMember.count({
    where: {
      memberId,
      deletedAt: null,
      status: "ACTIVE",
      committee: { deletedAt: null, status: { in: ["ACTIVE", "DRAFT"] } },
    },
  });
}
