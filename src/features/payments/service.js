import "server-only";

import * as repo from "./repository";
import { toPaymentDto } from "./dto";
import { ok, err } from "@/core/result";
import { ErrorCode } from "@/core/errors";
import { writeAudit, AuditAction } from "@/core/audit";
import { calculateLateFee, isLate } from "@/core/ledger";
import { formatMoney } from "@/core/money";

/**
 * Payment business rules.
 *
 * The governing principle: payments are an append-only ledger. Nothing here edits or
 * deletes a Payment row. Mistakes are corrected by appending a REVERSAL, which keeps
 * the history truthful — an edited payment makes the audit trail fiction.
 */

export async function listPayments(db, params) {
  const { rows, total } = await repo.listPayments(db, params);
  return { rows: rows.map(toPaymentDto), total };
}

/**
 * Record a payment.
 *
 * Everything — the payment, the pot transactions, the receipt and the audit entry —
 * happens in ONE transaction. A payment recorded without its ledger movement, or
 * without its audit row, would be a silent inconsistency in someone's money.
 */
export async function recordPayment(db, actor, input) {
  const committee = await db.committee.findUnique({
    where: { id: input.committeeId },
    select: {
      id: true,
      name: true,
      status: true,
      deletedAt: true,
      contributionMinor: true,
      currency: true,
      currencyExponent: true,
      totalSeats: true,
      startDate: true,
      drawFrequency: true,
      drawDay: true,
      gracePeriodDays: true,
      lateFeeType: true,
      lateFeeFlatMinor: true,
      lateFeePercentBps: true,
    },
  });

  if (!committee || committee.deletedAt) {
    return err(ErrorCode.NOT_FOUND, "That committee no longer exists.");
  }
  if (committee.status === "CANCELLED" || committee.status === "COMPLETED") {
    return err(
      ErrorCode.CONFLICT,
      `“${committee.name}” is ${committee.status.toLowerCase()} — no further payments can be recorded.`
    );
  }
  if (input.cycleNumber > committee.totalSeats) {
    return err(
      ErrorCode.VALIDATION,
      `This committee only runs ${committee.totalSeats} cycles.`,
      { fields: { cycleNumber: [`Must be between 1 and ${committee.totalSeats}`] } }
    );
  }

  const seat = await db.committeeMember.findUnique({
    where: { id: input.committeeMemberId },
    select: {
      id: true,
      committeeId: true,
      deletedAt: true,
      member: { select: { id: true, fullName: true } },
    },
  });

  // The seat must belong to the committee being paid into. Both ids come from the
  // client, so trusting them to agree would let a payment be filed against another
  // committee's roster.
  if (!seat || seat.deletedAt || seat.committeeId !== committee.id) {
    return err(ErrorCode.VALIDATION, "That member isn't in this committee.", {
      fields: { committeeMemberId: ["Not a member of the selected committee"] },
    });
  }

  // Late fee: calculated from the committee's own rules, not supplied by the client.
  // An override is allowed (waiving a fee is a real thing organisers do) but it is
  // explicit and audited rather than a quiet parameter.
  const late = isLate(committee, input.cycleNumber, input.paidAt);
  const calculatedFee = late ? calculateLateFee(committee, committee.contributionMinor) : 0n;
  const lateFeeMinor =
    input.lateFeeOverrideMinor !== null ? input.lateFeeOverrideMinor : calculatedFee;
  const feeWasOverridden =
    input.lateFeeOverrideMinor !== null && input.lateFeeOverrideMinor !== calculatedFee;

  const payment = await db.$transaction(async (tx) => {
    const created = await repo.createPayment(tx, {
      committeeId: committee.id,
      committeeMemberId: seat.id,
      cycleNumber: input.cycleNumber,
      amountMinor: input.amountMinor,
      lateFeeMinor,
      kind: "CONTRIBUTION",
      paidAt: input.paidAt,
      method: input.method,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      recordedByUserId: actor.userId,
    });

    // Pot movements. Contribution and late fee are separate lines so a cash-flow
    // report can tell "what members owed" apart from "what lateness cost them".
    await repo.createTransaction(tx, {
      committeeId: committee.id,
      type: "CONTRIBUTION_IN",
      amountMinor: input.amountMinor,
      paymentId: created.id,
      occurredAt: input.paidAt,
      description: `Cycle ${input.cycleNumber} — ${seat.member.fullName}`,
    });

    if (lateFeeMinor > 0n) {
      await repo.createTransaction(tx, {
        committeeId: committee.id,
        type: "LATE_FEE_IN",
        amountMinor: lateFeeMinor,
        paymentId: created.id,
        occurredAt: input.paidAt,
        description: `Late fee — cycle ${input.cycleNumber}`,
      });
    }

    // Receipt: an immutable snapshot of what was issued, so a reprint years later
    // shows the original rather than today's re-rendering of it.
    const receiptNumber = await repo.nextReceiptNumber(tx);
    const receipt = await repo.createReceipt(tx, {
      paymentId: created.id,
      receiptNumber,
      snapshot: {
        receiptNumber,
        issuedAt: new Date().toISOString(),
        committeeName: committee.name,
        memberName: seat.member.fullName,
        cycleNumber: input.cycleNumber,
        amount: formatMoney(input.amountMinor, committee.currency, committee.currencyExponent),
        lateFee: formatMoney(lateFeeMinor, committee.currency, committee.currencyExponent),
        total: formatMoney(
          input.amountMinor + lateFeeMinor,
          committee.currency,
          committee.currencyExponent
        ),
        method: input.method,
        referenceNumber: input.referenceNumber,
        paidAt: input.paidAt.toISOString(),
        recordedBy: actor.name ?? actor.email,
      },
    });

    await writeAudit(tx, {
      action: AuditAction.PAYMENT_CREATE,
      actorUserId: actor.userId,
      entityType: "Payment",
      entityId: created.id,
      after: {
        ...created,
        wasLate: late,
        calculatedFeeMinor: calculatedFee.toString(),
        feeWasOverridden,
      },
    });

    // The payment row was read before the receipt existed, so `created.receipt` is
    // null. Attach it, or the caller gets a payment with no receipt number and the
    // UI hides "View receipt" until the next refresh.
    return {
      ...created,
      receipt: { id: receipt.id, receiptNumber: receipt.receiptNumber },
    };
  });

  return ok(toPaymentDto(payment));
}

/**
 * Reverse a payment.
 *
 * Appends an equal-and-opposite row rather than touching the original. The signed
 * sum then nets to zero automatically, so every balance in the app corrects itself
 * without any special-casing of "cancelled" payments.
 */
export async function reversePayment(db, actor, { paymentId, reason }) {
  const original = await repo.findPaymentById(db, paymentId);
  if (!original) return err(ErrorCode.NOT_FOUND, "That payment no longer exists.");

  if (original.kind === "REVERSAL") {
    return err(
      ErrorCode.PAYMENT_NOT_REVERSIBLE,
      "That row is itself a reversal and can't be reversed again."
    );
  }
  if (original.reversedBy) {
    return err(ErrorCode.PAYMENT_ALREADY_REVERSED, "That payment has already been reversed.");
  }

  const reversal = await db.$transaction(async (tx) => {
    const created = await repo.createPayment(tx, {
      committeeId: original.committee.id,
      committeeMemberId: original.committeeMember.id,
      cycleNumber: original.cycleNumber,
      // Negated, so the ledger sum nets to zero with no special handling downstream.
      amountMinor: -BigInt(original.amountMinor),
      lateFeeMinor: -BigInt(original.lateFeeMinor ?? 0),
      kind: "REVERSAL",
      reversesPaymentId: original.id,
      reversalReason: reason,
      paidAt: new Date(),
      method: original.method,
      referenceNumber: original.referenceNumber,
      recordedByUserId: actor.userId,
    });

    await repo.createTransaction(tx, {
      committeeId: original.committee.id,
      type: "ADJUSTMENT",
      amountMinor: -(BigInt(original.amountMinor) + BigInt(original.lateFeeMinor ?? 0)),
      paymentId: created.id,
      occurredAt: new Date(),
      description: `Reversal of ${original.receipt?.receiptNumber ?? original.id}: ${reason}`,
    });

    await writeAudit(tx, {
      action: AuditAction.PAYMENT_REVERSE,
      actorUserId: actor.userId,
      entityType: "Payment",
      entityId: original.id,
      before: original,
      after: { reversalId: created.id, reason },
    });

    return created;
  });

  return ok(toPaymentDto(reversal));
}

export async function getReceipt(db, paymentId) {
  const receipt = await repo.findReceiptByPayment(db, paymentId);
  if (!receipt) return err(ErrorCode.NOT_FOUND, "No receipt for that payment.");
  return ok({
    id: receipt.id,
    receiptNumber: receipt.receiptNumber,
    issuedAt: receipt.issuedAt.toISOString(),
    ...receipt.snapshot,
  });
}
