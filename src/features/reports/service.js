import "server-only";

import { formatMoney, sumMinor, potForCycle } from "@/core/money";
import { memberLedger, cycleStatusFor, CycleStatus } from "@/core/ledger";
import { cycleDueDate } from "@/core/cycles";

/**
 * Reports.
 *
 * Every figure is derived from the payment ledger and the draw table at read
 * time — nothing here reads a stored total. A cached "collected" counter would
 * be a second source of truth, and the moment it disagreed with the payments it
 * summarises, the report would be lying about money.
 *
 * All reports return the same shape: { columns, rows, totals } — so one table
 * component and one CSV/Excel exporter serve all of them, rather than six
 * near-identical implementations drifting apart.
 */

/** Loads everything the reports need in one go — they all read the same source. */
async function loadCommitteeData(db, committeeId, now) {
  const committee = await db.committee.findUnique({
    where: { id: committeeId },
    select: {
      id: true,
      name: true,
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
      status: true,
    },
  });
  if (!committee) return null;

  const [seats, payments, draws] = await Promise.all([
    db.committeeMember.findMany({
      where: { committeeId, deletedAt: null },
      select: {
        id: true,
        position: true,
        member: { select: { id: true, fullName: true, phone: true } },
      },
      orderBy: { position: "asc" },
    }),
    db.payment.findMany({
      where: { committeeId },
      select: {
        id: true,
        committeeMemberId: true,
        cycleNumber: true,
        amountMinor: true,
        lateFeeMinor: true,
        kind: true,
        method: true,
        paidAt: true,
        referenceNumber: true,
        receipt: { select: { receiptNumber: true } },
        recordedBy: { select: { name: true, email: true } },
      },
      orderBy: { paidAt: "desc" },
    }),
    db.draw.findMany({
      where: { committeeId },
      select: {
        id: true,
        cycleNumber: true,
        drawnAt: true,
        payoutMinor: true,
        isOverride: true,
        overrideReason: true,
        winner: {
          select: { id: true, position: true, member: { select: { fullName: true } } },
        },
        conductedBy: { select: { name: true, email: true } },
      },
      orderBy: { cycleNumber: "asc" },
    }),
  ]);

  const paymentsBySeat = new Map();
  for (const p of payments) {
    const list = paymentsBySeat.get(p.committeeMemberId) ?? [];
    list.push(p);
    paymentsBySeat.set(p.committeeMemberId, list);
  }

  return { committee, seats, payments, draws, paymentsBySeat, now };
}

const money = (c) => (minor) => formatMoney(minor, c.currency, c.currencyExponent);

/**
 * Collection report — what each seat has paid, cycle by cycle.
 * The organiser's "who's actually paid up?" view.
 */
function collectionReport({ committee, seats, paymentsBySeat, now }) {
  const fmt = money(committee);

  const rows = seats.map((seat) => {
    const ledger = memberLedger(committee, paymentsBySeat.get(seat.id) ?? [], now);
    return {
      seat: `#${seat.position}`,
      member: seat.member.fullName,
      phone: seat.member.phone,
      cyclesPaid: `${ledger.cyclesPaid} of ${committee.totalSeats}`,
      paid: fmt(ledger.totalPaid),
      outstanding: fmt(ledger.totalOutstanding),
      status: ledger.isCurrent ? "Up to date" : "Behind",
      _sortOutstanding: ledger.totalOutstanding,
    };
  });

  const totalPaid = sumMinor(
    seats.map((s) => memberLedger(committee, paymentsBySeat.get(s.id) ?? [], now).totalPaid)
  );
  const totalOutstanding = sumMinor(
    seats.map(
      (s) => memberLedger(committee, paymentsBySeat.get(s.id) ?? [], now).totalOutstanding
    )
  );

  return {
    columns: [
      { key: "seat", label: "Seat" },
      { key: "member", label: "Member" },
      { key: "phone", label: "Phone" },
      { key: "cyclesPaid", label: "Cycles paid" },
      { key: "paid", label: "Paid", numeric: true },
      { key: "outstanding", label: "Outstanding", numeric: true },
      { key: "status", label: "Status" },
    ],
    rows,
    totals: { label: "All seats", paid: fmt(totalPaid), outstanding: fmt(totalOutstanding) },
  };
}

/**
 * Outstanding report — only who owes, and how much. Deliberately excludes the
 * paid-up: this is the chase list, and padding it with people who owe nothing
 * makes it useless.
 */
function outstandingReport({ committee, seats, paymentsBySeat, now }) {
  const fmt = money(committee);

  const rows = seats
    .map((seat) => {
      const ledger = memberLedger(committee, paymentsBySeat.get(seat.id) ?? [], now);
      const lateCycles = ledger.cycles.filter((c) => c.status === CycleStatus.LATE);
      const dueCycles = ledger.cycles.filter((c) => c.status === CycleStatus.DUE);

      return {
        seat: `#${seat.position}`,
        member: seat.member.fullName,
        phone: seat.member.phone,
        cyclesBehind: lateCycles.length + dueCycles.length,
        oldestUnpaid: lateCycles[0]
          ? `Cycle ${lateCycles[0].cycleNumber}`
          : dueCycles[0]
            ? `Cycle ${dueCycles[0].cycleNumber}`
            : "—",
        outstanding: fmt(ledger.totalOutstanding),
        _outstanding: ledger.totalOutstanding,
      };
    })
    .filter((r) => r._outstanding > 0n)
    .sort((a, b) => (b._outstanding > a._outstanding ? 1 : -1));

  return {
    columns: [
      { key: "seat", label: "Seat" },
      { key: "member", label: "Member" },
      { key: "phone", label: "Phone" },
      { key: "cyclesBehind", label: "Cycles behind", numeric: true },
      { key: "oldestUnpaid", label: "Oldest unpaid" },
      { key: "outstanding", label: "Outstanding", numeric: true },
    ],
    rows,
    totals: {
      label: `${rows.length} seat${rows.length === 1 ? "" : "s"} owing`,
      outstanding: fmt(sumMinor(rows.map((r) => r._outstanding))),
    },
  };
}

/** Committee ledger — every cycle: expected, collected, paid out, balance. */
function committeeLedgerReport({ committee, seats, paymentsBySeat, draws, now }) {
  const fmt = money(committee);
  const drawByCycle = new Map(draws.map((d) => [d.cycleNumber, d]));
  const potMinor = potForCycle(committee.contributionMinor, seats.length);

  const rows = [];
  for (let cycle = 1; cycle <= committee.totalSeats; cycle++) {
    let collected = 0n;
    for (const seat of seats) {
      const forCycle = (paymentsBySeat.get(seat.id) ?? []).filter(
        (p) => p.cycleNumber === cycle
      );
      const { paid } = cycleStatusFor(committee, cycle, forCycle, now);
      collected += paid;
    }

    const draw = drawByCycle.get(cycle);
    const paidOut = draw ? BigInt(draw.payoutMinor) : 0n;

    rows.push({
      cycle: `#${cycle}`,
      dueDate: cycleDueDate(committee, cycle).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      expected: fmt(potMinor),
      collected: fmt(collected),
      winner: draw?.winner?.member?.fullName ?? "—",
      paidOut: draw ? fmt(paidOut) : "—",
      balance: fmt(collected - paidOut),
      _collected: collected,
      _paidOut: paidOut,
    });
  }

  const totalCollected = sumMinor(rows.map((r) => r._collected));
  const totalPaidOut = sumMinor(rows.map((r) => r._paidOut));

  return {
    columns: [
      { key: "cycle", label: "Cycle" },
      { key: "dueDate", label: "Due" },
      { key: "expected", label: "Expected", numeric: true },
      { key: "collected", label: "Collected", numeric: true },
      { key: "winner", label: "Winner" },
      { key: "paidOut", label: "Paid out", numeric: true },
      { key: "balance", label: "Balance", numeric: true },
    ],
    rows,
    totals: {
      label: "All cycles",
      collected: fmt(totalCollected),
      paidOut: fmt(totalPaidOut),
      balance: fmt(totalCollected - totalPaidOut),
    },
  };
}

/** Payment history — the raw ledger, newest first. Reversals shown as negatives. */
function paymentHistoryReport({ committee, payments, seats }) {
  const fmt = money(committee);
  const seatById = new Map(seats.map((s) => [s.id, s]));

  const rows = payments.map((p) => {
    const seat = seatById.get(p.committeeMemberId);
    return {
      date: new Date(p.paidAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      receipt: p.receipt?.receiptNumber ?? "—",
      member: seat?.member.fullName ?? "—",
      cycle: `#${p.cycleNumber}`,
      amount: fmt(p.amountMinor),
      lateFee: fmt(p.lateFeeMinor ?? 0n),
      method: p.method,
      reference: p.referenceNumber ?? "—",
      kind: p.kind === "REVERSAL" ? "Reversal" : "Payment",
      recordedBy: p.recordedBy?.name ?? p.recordedBy?.email ?? "—",
      _amount: BigInt(p.amountMinor) + BigInt(p.lateFeeMinor ?? 0),
    };
  });

  return {
    columns: [
      { key: "date", label: "Date" },
      { key: "receipt", label: "Receipt" },
      { key: "member", label: "Member" },
      { key: "cycle", label: "Cycle" },
      { key: "amount", label: "Amount", numeric: true },
      { key: "lateFee", label: "Late fee", numeric: true },
      { key: "method", label: "Method" },
      { key: "reference", label: "Reference" },
      { key: "kind", label: "Type" },
      { key: "recordedBy", label: "Recorded by" },
    ],
    rows,
    totals: {
      label: `${rows.length} entr${rows.length === 1 ? "y" : "ies"}`,
      amount: fmt(sumMinor(rows.map((r) => r._amount))),
    },
  };
}

/** Winner history — who took the pot, when, and whether the rules were waived. */
function winnerHistoryReport({ committee, draws }) {
  const fmt = money(committee);

  const rows = draws.map((d) => ({
    cycle: `#${d.cycleNumber}`,
    date: new Date(d.drawnAt).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    winner: d.winner?.member?.fullName ?? "—",
    seat: d.winner ? `#${d.winner.position}` : "—",
    payout: fmt(d.payoutMinor),
    how: d.isOverride ? "Override" : "Normal",
    reason: d.overrideReason ?? "—",
    conductedBy: d.conductedBy?.name ?? d.conductedBy?.email ?? "—",
    _payout: BigInt(d.payoutMinor),
  }));

  return {
    columns: [
      { key: "cycle", label: "Cycle" },
      { key: "date", label: "Drawn" },
      { key: "winner", label: "Winner" },
      { key: "seat", label: "Seat" },
      { key: "payout", label: "Payout", numeric: true },
      { key: "how", label: "How" },
      { key: "reason", label: "Override reason" },
      { key: "conductedBy", label: "Conducted by" },
    ],
    rows,
    totals: {
      label: `${rows.length} draw${rows.length === 1 ? "" : "s"}`,
      payout: fmt(sumMinor(rows.map((r) => r._payout))),
    },
  };
}

/** Late payment report — every payment that attracted a fee, and what it cost. */
function latePaymentReport({ committee, payments, seats }) {
  const fmt = money(committee);
  const seatById = new Map(seats.map((s) => [s.id, s]));

  const rows = payments
    .filter((p) => BigInt(p.lateFeeMinor ?? 0) > 0n)
    .map((p) => {
      const seat = seatById.get(p.committeeMemberId);
      const due = cycleDueDate(committee, p.cycleNumber);
      const daysLate = Math.max(
        0,
        Math.floor((new Date(p.paidAt) - due) / (1000 * 60 * 60 * 24))
      );

      return {
        member: seat?.member.fullName ?? "—",
        cycle: `#${p.cycleNumber}`,
        dueDate: due.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
        paidDate: new Date(p.paidAt).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
        }),
        daysLate,
        lateFee: fmt(p.lateFeeMinor),
        _fee: BigInt(p.lateFeeMinor),
      };
    })
    .sort((a, b) => b.daysLate - a.daysLate);

  return {
    columns: [
      { key: "member", label: "Member" },
      { key: "cycle", label: "Cycle" },
      { key: "dueDate", label: "Due" },
      { key: "paidDate", label: "Paid" },
      { key: "daysLate", label: "Days late", numeric: true },
      { key: "lateFee", label: "Late fee", numeric: true },
    ],
    rows,
    totals: {
      label: `${rows.length} late payment${rows.length === 1 ? "" : "s"}`,
      lateFee: fmt(sumMinor(rows.map((r) => r._fee))),
    },
  };
}

export const REPORTS = {
  collection: { label: "Collection", build: collectionReport },
  outstanding: { label: "Outstanding", build: outstandingReport },
  ledger: { label: "Committee ledger", build: committeeLedgerReport },
  payments: { label: "Payment history", build: paymentHistoryReport },
  winners: { label: "Winner history", build: winnerHistoryReport },
  late: { label: "Late payments", build: latePaymentReport },
};

export const REPORT_KEYS = Object.keys(REPORTS);

/**
 * Build one report. Returns JSON-safe rows — BigInt is stripped by the builders
 * (the `_`-prefixed sort keys are removed here) so nothing leaks across the RSC
 * boundary.
 */
export async function buildReport(db, committeeId, reportKey, now = new Date()) {
  const report = REPORTS[reportKey];
  if (!report) return null;

  const data = await loadCommitteeData(db, committeeId, now);
  if (!data) return null;

  const built = report.build(data);

  return {
    key: reportKey,
    label: report.label,
    committeeName: data.committee.name,
    generatedAt: now.toISOString(),
    columns: built.columns,
    // Strip the internal BigInt sort keys — they can't cross to the client.
    rows: built.rows.map((row) => {
      const clean = {};
      for (const [k, v] of Object.entries(row)) {
        if (!k.startsWith("_")) clean[k] = v;
      }
      return clean;
    }),
    totals: built.totals,
  };
}
