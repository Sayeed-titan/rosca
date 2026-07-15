import { formatMoney, toMajorString, potForCycle } from "@/core/money";
import { cyclesElapsed, nextDueDate } from "@/core/cycles";

/**
 * Committee DTOs — the Server/Client serialization boundary.
 *
 * BigInt cannot be JSON-serialised, so every amount leaves here as a string. This
 * is the single place that conversion happens; nothing downstream ever sees a
 * BigInt, and nothing upstream ever sees a float.
 *
 * Pre-formatted display strings are included deliberately: formatting money needs
 * the currency and exponent, and doing it once on the server beats threading both
 * through every component that shows an amount.
 */
export function toCommitteeDto(committee, now = new Date()) {
  const memberCount = committee._count?.members ?? 0;
  const potMinor = potForCycle(committee.contributionMinor, memberCount);
  const elapsed = cyclesElapsed(committee, now);
  const next = nextDueDate(committee, now);

  return {
    id: committee.id,
    name: committee.name,
    description: committee.description,

    // Raw (exact, as a string) plus display — callers pick what they need.
    contributionMinor: committee.contributionMinor.toString(),
    contribution: toMajorString(committee.contributionMinor, committee.currencyExponent),
    contributionDisplay: formatMoney(
      committee.contributionMinor,
      committee.currency,
      committee.currencyExponent
    ),

    potMinor: potMinor.toString(),
    potDisplay: formatMoney(potMinor, committee.currency, committee.currencyExponent),

    currency: committee.currency,
    currencyExponent: committee.currencyExponent,

    totalMembers: committee.totalMembers,
    memberCount,
    /// Seats still to fill before the committee can run.
    seatsOpen: Math.max(0, committee.totalMembers - memberCount),

    startDate: committee.startDate?.toISOString() ?? null,
    endDate: committee.endDate?.toISOString() ?? null,

    drawFrequency: committee.drawFrequency,
    drawDay: committee.drawDay,
    gracePeriodDays: committee.gracePeriodDays,

    lateFeeType: committee.lateFeeType,
    lateFeeFlat: toMajorString(committee.lateFeeFlatMinor, committee.currencyExponent),
    // bps -> percent for display: 250 -> "2.5"
    lateFeePercent: (committee.lateFeePercentBps / 100).toString(),

    status: committee.status,
    createdAt: committee.createdAt?.toISOString() ?? null,

    cyclesElapsed: elapsed,
    cyclesTotal: committee.totalMembers,
    drawsRun: committee._count?.draws ?? 0,
    nextDueDate: next ? next.dueDate.toISOString() : null,
    nextCycleNumber: next ? next.cycleNumber : null,
  };
}

/** Shape the edit form expects — every field a string, nothing null. */
export function toCommitteeFormValues(dto) {
  return {
    name: dto.name ?? "",
    description: dto.description ?? "",
    contribution: dto.contribution ?? "",
    currency: dto.currency ?? "BDT",
    totalMembers: String(dto.totalMembers ?? 10),
    startDate: dto.startDate ? dto.startDate.slice(0, 10) : "",
    endDate: dto.endDate ? dto.endDate.slice(0, 10) : "",
    drawFrequency: dto.drawFrequency ?? "MONTHLY",
    drawDay: String(dto.drawDay ?? 1),
    gracePeriodDays: String(dto.gracePeriodDays ?? 0),
    lateFeeType: dto.lateFeeType ?? "NONE",
    lateFeeFlat: dto.lateFeeFlat ?? "",
    lateFeePercent: dto.lateFeePercent ?? "",
    status: dto.status ?? "DRAFT",
  };
}
