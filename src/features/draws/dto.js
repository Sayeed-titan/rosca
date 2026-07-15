import { formatMoney } from "@/core/money";

/** Draw DTO — BigInt to string, and the verification material for the UI. */
export function toDrawDto(draw) {
  const currency = draw.committee?.currency ?? "BDT";
  const exponent = draw.committee?.currencyExponent ?? 2;

  return {
    id: draw.id,
    cycleNumber: draw.cycleNumber,
    drawnAt: draw.drawnAt?.toISOString() ?? null,

    payoutMinor: draw.payoutMinor.toString(),
    payoutDisplay: formatMoney(draw.payoutMinor, currency, exponent),

    committeeId: draw.committee?.id ?? null,
    committeeName: draw.committee?.name ?? null,

    winnerId: draw.winner?.id ?? null,
    winnerName: draw.winner?.member?.fullName ?? null,
    winnerPhotoUrl: draw.winner?.member?.photoUrl ?? null,
    winnerPosition: draw.winner?.position ?? null,

    mode: draw.mode,
    isOverride: draw.isOverride,
    overrideReason: draw.overrideReason,
    conductedBy: draw.conductedBy?.name ?? draw.conductedBy?.email ?? "—",

    // The proof, shipped to the client on purpose: a member should be able to
    // verify the draw themselves, not just be told it was fair.
    seedCommitment: draw.seedCommitment,
    serverSeed: draw.serverSeed,
    eligibleSnapshot: draw.eligibleSnapshot,
    winnerIndex: draw.winnerIndex,
    algorithmVersion: draw.algorithmVersion,
  };
}
