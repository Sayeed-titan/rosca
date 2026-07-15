/**
 * Verifiable randomness for the draw.
 *
 * This is the most important file in the application. A ROSCA works only if members
 * believe the draw is honest, and "trust us, it's random" is not a mechanism.
 *
 * THE SCHEME — commit / reveal:
 *
 *   1. Before drawing, the server generates a 32-byte `serverSeed` and publishes
 *      `commitment = SHA256(serverSeed)`. The seed itself stays hidden.
 *   2. The winner index is derived DETERMINISTICALLY from the seed and the draw's
 *      context (committee, cycle, and the frozen candidate list).
 *   3. After drawing, the seed is revealed. Anyone can then recompute SHA256(seed),
 *      check it equals the published commitment, re-derive the index, and confirm
 *      the winner.
 *
 * Why this beats a bare `crypto.randomInt()`: randomInt is unpredictable, but it is
 * also *unverifiable*. A member who loses has no way to check the organiser didn't
 * simply pick their cousin. With commit/reveal, rigging a draw requires either
 * breaking SHA-256 or predicting the seed before it was committed.
 *
 * WHY NOT MODULO: `randomValue % n` is biased toward low indices whenever n doesn't
 * divide the range evenly — with 8 members and a byte (256 values), 256 % 8 == 0 so
 * it happens to be fine, but with 6 members 256 % 6 == 4, so members 0–3 would come
 * up measurably more often than 4–5. Over a committee's lifetime that is a real,
 * detectable unfairness. We use rejection sampling instead. The chi-square test in
 * tests/draw.test.js exists to catch exactly this if anyone "simplifies" it later.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Bumped if the derivation ever changes, so historical draws stay verifiable. */
export const ALGORITHM_VERSION = 1;

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Generate a fresh seed and its commitment.
 * The commitment is published BEFORE the draw; the seed only after.
 */
export function createSeedCommitment() {
  const serverSeed = randomBytes(32).toString("hex");
  return { serverSeed, commitment: sha256Hex(serverSeed) };
}

/** Does a revealed seed match the commitment made beforehand? */
export function verifyCommitment(serverSeed, commitment) {
  if (typeof serverSeed !== "string" || typeof commitment !== "string") return false;

  const actual = Buffer.from(sha256Hex(serverSeed), "hex");
  const expected = Buffer.from(commitment, "hex");
  if (actual.length !== expected.length) return false;

  // Constant-time: this check gates a payout, so don't leak how much of a forged
  // commitment was correct.
  return timingSafeEqual(actual, expected);
}

/**
 * The exact string the index is derived from.
 *
 * The candidate list is part of the context on purpose: it binds the result to the
 * precise set of people who were eligible. Without it, an organiser could re-run the
 * derivation against a different roster and claim a different winner was "the" one.
 */
export function drawContext({ committeeId, cycleNumber, candidateIds }) {
  return [
    `v${ALGORITHM_VERSION}`,
    committeeId,
    `cycle:${cycleNumber}`,
    `candidates:${candidateIds.join(",")}`,
  ].join("|");
}

/**
 * An endless, deterministic byte stream from (seed, context).
 * HMAC-SHA256 in counter mode — the same construction as HMAC-DRBG.
 */
function* byteStream(serverSeed, context) {
  let counter = 0;
  for (;;) {
    const block = createHmac("sha256", serverSeed)
      .update(`${context}|${counter}`)
      .digest();
    counter += 1;
    for (const byte of block) yield byte;
  }
}

/**
 * Uniform index in [0, n) — unbiased, via rejection sampling.
 *
 * Takes just enough whole bytes to cover n, then rejects any value at or above the
 * largest exact multiple of n. Discarding the leftover tail is what removes modulo
 * bias; the expected number of retries is under 2.
 */
export function deriveIndex(serverSeed, context, n) {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Candidate count must be a positive integer, got ${n}`);
  }
  if (n === 1) return 0;

  const bytesNeeded = Math.ceil(Math.log2(n) / 8);
  const range = 2 ** (bytesNeeded * 8);
  // Largest multiple of n that fits; anything at or above this is thrown away.
  const limit = range - (range % n);

  const stream = byteStream(serverSeed, context);

  for (;;) {
    let value = 0;
    for (let i = 0; i < bytesNeeded; i += 1) {
      // Multiply rather than shift: `<<` is 32-bit signed and would corrupt
      // 4-byte values.
      value = value * 256 + stream.next().value;
    }

    if (value < limit) return value % n;
    // Rejected — draw more bytes. This is the branch that keeps it uniform.
  }
}

/**
 * Re-derive a completed draw and check it end to end.
 * This is what makes the draw auditable by a suspicious member.
 *
 * @returns {{valid: boolean, reason?: string, winnerIndex?: number, winnerId?: string}}
 */
export function verifyDraw({ serverSeed, commitment, committeeId, cycleNumber, candidateIds, winnerIndex }) {
  if (!serverSeed) {
    return { valid: false, reason: "Seed has not been revealed yet." };
  }
  if (!verifyCommitment(serverSeed, commitment)) {
    return { valid: false, reason: "Revealed seed does not match the published commitment." };
  }

  const context = drawContext({ committeeId, cycleNumber, candidateIds });
  const recomputed = deriveIndex(serverSeed, context, candidateIds.length);

  if (recomputed !== winnerIndex) {
    return {
      valid: false,
      reason: `Recorded winner index ${winnerIndex} does not match the derived index ${recomputed}.`,
    };
  }

  return { valid: true, winnerIndex: recomputed, winnerId: candidateIds[recomputed] };
}
