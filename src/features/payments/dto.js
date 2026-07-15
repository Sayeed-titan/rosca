import { formatMoney, toMajorString } from "@/core/money";

/**
 * Payment DTOs — the BigInt -> string boundary.
 */
export function toPaymentDto(payment) {
  const currency = payment.committee?.currency ?? "BDT";
  const exponent = payment.committee?.currencyExponent ?? 2;

  const total = BigInt(payment.amountMinor) + BigInt(payment.lateFeeMinor ?? 0);

  return {
    id: payment.id,
    cycleNumber: payment.cycleNumber,

    amountMinor: payment.amountMinor.toString(),
    amount: toMajorString(payment.amountMinor, exponent),
    amountDisplay: formatMoney(payment.amountMinor, currency, exponent),

    lateFeeMinor: (payment.lateFeeMinor ?? 0n).toString(),
    lateFeeDisplay: formatMoney(payment.lateFeeMinor ?? 0n, currency, exponent),
    hasLateFee: BigInt(payment.lateFeeMinor ?? 0) !== 0n,

    totalDisplay: formatMoney(total, currency, exponent),

    kind: payment.kind,
    isReversal: payment.kind === "REVERSAL",
    /// True once a reversal points at this row — the UI must not offer to reverse twice.
    isReversed: Boolean(payment.reversedBy),
    reversesPaymentId: payment.reversesPaymentId,
    reversalReason: payment.reversalReason,

    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt?.toISOString() ?? null,
    method: payment.method,
    referenceNumber: payment.referenceNumber,
    notes: payment.notes,

    currency,
    currencyExponent: exponent,

    committeeId: payment.committee?.id ?? null,
    committeeName: payment.committee?.name ?? null,

    committeeMemberId: payment.committeeMember?.id ?? null,
    memberName: payment.committeeMember?.member?.fullName ?? null,
    position: payment.committeeMember?.position ?? null,

    recordedBy: payment.recordedBy?.name ?? payment.recordedBy?.email ?? "—",

    receiptId: payment.receipt?.id ?? null,
    receiptNumber: payment.receipt?.receiptNumber ?? null,
  };
}

/** Ledger view for one member — BigInt-free. */
export function toLedgerDto(ledger, currency, exponent) {
  return {
    cycles: ledger.cycles.map((c) => ({
      cycleNumber: c.cycleNumber,
      status: c.status,
      paidDisplay: formatMoney(c.paid, currency, exponent),
      expectedDisplay: formatMoney(c.expected, currency, exponent),
      outstandingDisplay: formatMoney(c.outstanding, currency, exponent),
      outstandingMinor: c.outstanding.toString(),
      dueDate: c.dueDate.toISOString(),
    })),
    totalPaidDisplay: formatMoney(ledger.totalPaid, currency, exponent),
    totalOutstandingDisplay: formatMoney(ledger.totalOutstanding, currency, exponent),
    totalOutstandingMinor: ledger.totalOutstanding.toString(),
    cyclesPaid: ledger.cyclesPaid,
    remainingInstallments: ledger.remainingInstallments,
    isCurrent: ledger.isCurrent,
  };
}
