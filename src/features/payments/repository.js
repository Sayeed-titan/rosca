import "server-only";

/**
 * Payment data access. Append-only: there is deliberately no update() and no
 * delete() here. A payment is corrected by inserting a reversal row, never by
 * editing or removing the original — see the Payment model in schema.prisma.
 */

const LIST_SELECT = {
  id: true,
  cycleNumber: true,
  amountMinor: true,
  lateFeeMinor: true,
  kind: true,
  paidAt: true,
  method: true,
  referenceNumber: true,
  notes: true,
  createdAt: true,
  reversesPaymentId: true,
  reversalReason: true,
  committee: {
    select: { id: true, name: true, currency: true, currencyExponent: true },
  },
  committeeMember: {
    select: {
      id: true,
      position: true,
      member: { select: { id: true, fullName: true } },
    },
  },
  recordedBy: { select: { name: true, email: true } },
  receipt: { select: { id: true, receiptNumber: true } },
  reversedBy: { select: { id: true } },
};

function buildWhere({ q, committeeId }) {
  const where = {};
  if (committeeId) where.committeeId = committeeId;
  if (q) {
    where.OR = [
      { referenceNumber: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
      { committeeMember: { member: { fullName: { contains: q, mode: "insensitive" } } } },
      { committee: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  return where;
}

export async function listPayments(db, { page, pageSize, q, sort, dir, committeeId }) {
  const where = buildWhere({ q, committeeId });

  const [rows, total] = await Promise.all([
    db.payment.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { [sort]: dir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.payment.count({ where }),
  ]);

  return { rows, total };
}

export async function findPaymentById(db, id) {
  return db.payment.findUnique({ where: { id }, select: LIST_SELECT });
}

export async function createPayment(db, data) {
  return db.payment.create({ data, select: LIST_SELECT });
}

/** Every payment for one member across all cycles — the input to their ledger. */
export async function paymentsForMember(db, committeeMemberId) {
  return db.payment.findMany({
    where: { committeeMemberId },
    select: { id: true, cycleNumber: true, amountMinor: true, lateFeeMinor: true },
  });
}

/** Every payment in a committee, grouped by member. Used for the draw's gate. */
export async function paymentsByCommittee(db, committeeId) {
  return db.payment.findMany({
    where: { committeeId },
    select: {
      id: true,
      committeeMemberId: true,
      cycleNumber: true,
      amountMinor: true,
      lateFeeMinor: true,
    },
  });
}

export async function createTransaction(db, data) {
  return db.transaction.create({ data });
}

/**
 * Next receipt number for an organization.
 *
 * Counts existing receipts inside the caller's transaction. Two receipts issued at
 * the same instant could collide — the UNIQUE(organizationId, receiptNumber) index
 * catches that and the transaction rolls back, so a duplicate is impossible even
 * though this isn't a true sequence.
 */
export async function nextReceiptNumber(db, prefix = "RCT") {
  const count = await db.receipt.count();
  const year = new Date().getUTCFullYear();
  return `${prefix}-${year}-${String(count + 1).padStart(5, "0")}`;
}

export async function createReceipt(db, data) {
  return db.receipt.create({ data });
}

export async function findReceiptByPayment(db, paymentId) {
  return db.receipt.findUnique({
    where: { paymentId },
    select: { id: true, receiptNumber: true, issuedAt: true, snapshot: true },
  });
}
