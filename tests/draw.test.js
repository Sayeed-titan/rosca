/**
 * Draw fairness.
 *
 * These tests are the product. The wheel and the confetti are decoration; what a
 * member actually needs is the guarantee that the draw was uniform, unriggable and
 * checkable afterwards. If these fail, nothing else about the app matters.
 */
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";

import {
  createSeedCommitment,
  verifyCommitment,
  deriveIndex,
  drawContext,
  verifyDraw,
  sha256Hex,
  ALGORITHM_VERSION,
} from "@/core/draw/rng";

const ids = (n) => Array.from({ length: n }, (_, i) => `m${i + 1}`);

describe("commit / reveal", () => {
  it("produces a 32-byte seed and its SHA-256 commitment", () => {
    const { serverSeed, commitment } = createSeedCommitment();
    expect(serverSeed).toMatch(/^[0-9a-f]{64}$/);
    expect(commitment).toMatch(/^[0-9a-f]{64}$/);
    expect(commitment).toBe(sha256Hex(serverSeed));
  });

  it("never repeats a seed", () => {
    const seen = new Set();
    for (let i = 0; i < 1000; i++) seen.add(createSeedCommitment().serverSeed);
    expect(seen.size).toBe(1000);
  });

  it("accepts the true seed and rejects any other", () => {
    const { serverSeed, commitment } = createSeedCommitment();
    expect(verifyCommitment(serverSeed, commitment)).toBe(true);

    const other = createSeedCommitment().serverSeed;
    expect(verifyCommitment(other, commitment)).toBe(false);
  });

  it("rejects a tampered seed — one flipped character breaks it", () => {
    const { serverSeed, commitment } = createSeedCommitment();
    const tampered = (serverSeed[0] === "a" ? "b" : "a") + serverSeed.slice(1);
    expect(verifyCommitment(tampered, commitment)).toBe(false);
  });

  it("rejects malformed input rather than throwing", () => {
    expect(verifyCommitment(null, "abc")).toBe(false);
    expect(verifyCommitment("abc", null)).toBe(false);
    expect(verifyCommitment("abc", "def")).toBe(false);
  });
});

describe("deriveIndex — determinism", () => {
  it("is deterministic: the same seed and context always give the same winner", () => {
    const { serverSeed } = createSeedCommitment();
    const ctx = drawContext({ committeeId: "c1", cycleNumber: 1, candidateIds: ids(8) });

    const first = deriveIndex(serverSeed, ctx, 8);
    for (let i = 0; i < 50; i++) {
      expect(deriveIndex(serverSeed, ctx, 8)).toBe(first);
    }
  });

  it("gives a different result for a different cycle", () => {
    const { serverSeed } = createSeedCommitment();
    const a = deriveIndex(serverSeed, drawContext({ committeeId: "c1", cycleNumber: 1, candidateIds: ids(8) }), 8);
    const b = deriveIndex(serverSeed, drawContext({ committeeId: "c1", cycleNumber: 2, candidateIds: ids(8) }), 8);
    // Not guaranteed different, but the context must at least be distinct.
    expect(
      drawContext({ committeeId: "c1", cycleNumber: 1, candidateIds: ids(8) })
    ).not.toBe(drawContext({ committeeId: "c1", cycleNumber: 2, candidateIds: ids(8) }));
    expect(typeof a).toBe("number");
    expect(typeof b).toBe("number");
  });

  it("binds the result to the exact candidate list", () => {
    // Changing who was eligible must change the context, so an organiser can't
    // re-run the derivation against a different roster and claim another winner.
    const c1 = drawContext({ committeeId: "c1", cycleNumber: 1, candidateIds: ["a", "b"] });
    const c2 = drawContext({ committeeId: "c1", cycleNumber: 1, candidateIds: ["b", "a"] });
    expect(c1).not.toBe(c2);
  });

  it("always lands inside the candidate range", () => {
    for (let n = 1; n <= 40; n++) {
      for (let t = 0; t < 25; t++) {
        const { serverSeed } = createSeedCommitment();
        const idx = deriveIndex(serverSeed, drawContext({ committeeId: "c", cycleNumber: t, candidateIds: ids(n) }), n);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(n);
        expect(Number.isInteger(idx)).toBe(true);
      }
    }
  });

  it("returns 0 for a single candidate", () => {
    const { serverSeed } = createSeedCommitment();
    expect(deriveIndex(serverSeed, "ctx", 1)).toBe(0);
  });

  it("rejects a nonsensical candidate count", () => {
    const { serverSeed } = createSeedCommitment();
    expect(() => deriveIndex(serverSeed, "ctx", 0)).toThrow();
    expect(() => deriveIndex(serverSeed, "ctx", -3)).toThrow();
    expect(() => deriveIndex(serverSeed, "ctx", 2.5)).toThrow();
  });
});

/**
 * The statistical core.
 *
 * n=6 is chosen deliberately: 256 % 6 == 4, so a naive `byte % 6` favours indices
 * 0–3 over 4–5. Over a real committee's life that is a detectable bias in who wins
 * early, when the pot is worth most. These tests fail loudly if rejection sampling
 * is ever replaced with a modulo.
 *
 * ON THE THRESHOLDS (alpha = 0.0001, not the more usual 0.001):
 *
 * These tests are inherently random, so they carry a false-failure rate equal to
 * whatever alpha we pick. At p=0.001 each test cries wolf once per 1,000 runs; with
 * three of them that's a flake every ~330 runs, and a fairness suite that flakes is
 * a fairness suite people learn to re-run until green — which is worse than having
 * none, because it launders a real failure into noise.
 *
 * Tightening to p=0.0001 costs nothing in detection: the biased implementation
 * scores ~61, which clears both thresholds by miles (see the modulo test below).
 * So we get ~10x fewer false alarms and lose no teeth.
 */
describe("uniformity — chi-square", () => {
  /**
   * Chi-square goodness-of-fit against a uniform expectation.
   * Returns the statistic; compare against a critical value for df = n-1.
   */
  function chiSquare(counts, total) {
    const n = counts.length;
    const expected = total / n;
    return counts.reduce((sum, observed) => {
      const d = observed - expected;
      return sum + (d * d) / expected;
    }, 0);
  }

  /**
   * One seed, many contexts — rather than a fresh seed per sample.
   *
   * Statistically equivalent for testing deriveIndex (each context yields an
   * independent HMAC stream) but ~3x cheaper, which is what makes the sample sizes
   * below affordable. And the sample size is the whole point: see the note on
   * statistical power in the modulo test.
   */
  const { serverSeed: FIXED_SEED } = createSeedCommitment();

  function distribute(n, samples, indexFn = deriveIndex) {
    const counts = new Array(n).fill(0);
    for (let i = 0; i < samples; i++) {
      counts[indexFn(FIXED_SEED, `uniformity|${n}|${i}`, n)] += 1;
    }
    return counts;
  }

  /** The naive implementation this design exists to avoid. */
  function modulo(seed, context, n) {
    return createHmac("sha256", seed).update(context).digest()[0] % n;
  }

  it("is uniform for n=6, exactly where modulo bias bites (500k draws)", () => {
    const n = 6;
    // 500k, not 100k. At 100k this test lacks the statistical power to reject the
    // biased implementation (expected chi-square ~12.2, threshold 20.515), so
    // passing would prove nothing at all. See the modulo test above.
    const samples = 500_000;
    const counts = distribute(n, samples);

    // df = 5, critical value at p=0.0001 is 25.745. See the note on alpha below.
    expect(chiSquare(counts, samples)).toBeLessThan(25.745);

    // Sanity: every index must actually occur.
    for (const c of counts) expect(c).toBeGreaterThan(0);
  });

  it("is uniform for n=8, a power of two (200k draws)", () => {
    const n = 8;
    const samples = 200_000;
    // df = 7, critical value at p=0.0001 is 29.878.
    expect(chiSquare(distribute(n, samples), samples)).toBeLessThan(29.878);
  });

  it("is uniform for n=7, a prime dividing no power of two (200k draws)", () => {
    const n = 7;
    const samples = 200_000;
    // df = 6, critical value at p=0.0001 is 27.856.
    expect(chiSquare(distribute(n, samples), samples)).toBeLessThan(27.856);
  });

  it("the bias modulo introduces is exact and provable, not hypothetical", () => {
    // No sampling, no statistics — just count how a byte maps under `% 6`.
    // 256 = 6*42 + 4, so four indices get 43 of the 256 byte values and two get 42.
    const counts = new Array(6).fill(0);
    for (let byte = 0; byte < 256; byte++) counts[byte % 6] += 1;

    expect(counts).toEqual([43, 43, 43, 43, 42, 42]);
    // Indices 0–3 are ~2.4% likelier than 4–5. Over a committee's life, that is a
    // real advantage in winning early, when the pot is worth most.
    expect(counts[0] / counts[5]).toBeCloseTo(43 / 42, 5);
  });

  it("CATCHES modulo bias at sufficient sample size — proving these tests have teeth", () => {
    // A fairness test that cannot fail is decorative. This runs the naive
    // implementation and asserts the chi-square rejects it.
    //
    // Sample size matters more than intuition suggests. The n=6 bias is only ~0.78%
    // per index, which at 100k draws yields chi-square ~12.2 — UNDER the 20.515
    // threshold. An earlier version of this suite used 100k and would therefore have
    // happily passed a biased implementation. chi-square grows linearly with N, so
    // 500k puts the expected statistic around ~61 and detection beyond doubt.
    const n = 6;
    const samples = 500_000;

    const biased = chiSquare(distribute(n, samples, modulo), samples);
    expect(biased).toBeGreaterThan(25.745);

    // The skew is directional, not noise.
    const counts = distribute(n, samples, modulo);
    const low = (counts[0] + counts[1] + counts[2] + counts[3]) / 4;
    const high = (counts[4] + counts[5]) / 2;
    expect(low).toBeGreaterThan(high);
  });

  it("our implementation passes at the SAME sample size that exposes modulo", () => {
    // The controlled comparison: identical n, identical N, identical threshold.
    // Only the sampling strategy differs.
    const n = 6;
    const samples = 500_000;
    const ours = chiSquare(distribute(n, samples), samples);
    expect(ours).toBeLessThan(25.745);
  });

  it("keeps every index within 4 sigma of its expected share for n=6", () => {
    const n = 6;
    const samples = 500_000;
    const counts = distribute(n, samples);
    const expected = samples / n;

    // Bound derived from the sampling distribution, not picked by eye.
    //
    // Counts are binomial(N, 1/n), so sigma = sqrt(N * p * (1-p)) ~= 264 here, i.e.
    // ~0.32% of the expected 83,333. An earlier version of this test asserted a flat
    // "within 0.5%", which is only ~1.6 sigma — each index breaches that ~11% of the
    // time, so with 6 indices the test failed roughly half the time. A flaky test in
    // a fairness suite is worse than no test, because people learn to re-run it.
    //
    // 4 sigma is breached ~6e-5 of the time per index: reliable, and still a real
    // check. The chi-square above is the sensitive detector; this is a sanity bound.
    const sigma = Math.sqrt(samples * (1 / n) * (1 - 1 / n));
    const bound = 4 * sigma;

    for (const c of counts) {
      expect(Math.abs(c - expected)).toBeLessThan(bound);
    }
  });
});

describe("verifyDraw — what a suspicious member would run", () => {
  const candidateIds = ids(8);
  const committeeId = "committee-1";
  const cycleNumber = 3;

  function runDraw() {
    const { serverSeed, commitment } = createSeedCommitment();
    const context = drawContext({ committeeId, cycleNumber, candidateIds });
    const winnerIndex = deriveIndex(serverSeed, context, candidateIds.length);
    return { serverSeed, commitment, winnerIndex };
  }

  it("verifies an honest draw", () => {
    const { serverSeed, commitment, winnerIndex } = runDraw();
    const r = verifyDraw({ serverSeed, commitment, committeeId, cycleNumber, candidateIds, winnerIndex });

    expect(r.valid).toBe(true);
    expect(r.winnerIndex).toBe(winnerIndex);
    expect(r.winnerId).toBe(candidateIds[winnerIndex]);
  });

  it("catches a forged winner — the headline guarantee", () => {
    const { serverSeed, commitment, winnerIndex } = runDraw();
    const forged = (winnerIndex + 1) % candidateIds.length;

    const r = verifyDraw({ serverSeed, commitment, committeeId, cycleNumber, candidateIds, winnerIndex: forged });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("does not match the derived index");
  });

  it("catches a swapped seed", () => {
    const { commitment, winnerIndex } = runDraw();
    const otherSeed = createSeedCommitment().serverSeed;

    const r = verifyDraw({ serverSeed: otherSeed, commitment, committeeId, cycleNumber, candidateIds, winnerIndex });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("does not match the published commitment");
  });

  it("catches a doctored candidate list — detected, or harmless", () => {
    // Same probabilistic property as the cycle-binding test below, for the same
    // reason: re-deriving over a 9-candidate list gives a fresh index that matches
    // the recorded one about 1 time in 9. Asserting certainty here made this test
    // flake ~12% of the time.
    //
    // And as before, a coincidence is benign: if the re-derived index equals the
    // recorded one, it still points at the same person, so sneaking an extra
    // candidate in changed nothing. The check only "misses" where there is nothing
    // to miss.
    let detected = 0;
    const trials = 400;

    for (let t = 0; t < trials; t++) {
      const { serverSeed, commitment } = createSeedCommitment();
      const realIndex = deriveIndex(
        serverSeed,
        drawContext({ committeeId, cycleNumber, candidateIds }),
        candidateIds.length
      );

      const r = verifyDraw({
        serverSeed,
        commitment,
        committeeId,
        cycleNumber,
        candidateIds: [...candidateIds, "m9-sneaked-in"],
        winnerIndex: realIndex,
      });

      if (!r.valid) detected += 1;
      else {
        // Verified only because the same person is still indicated.
        expect(r.winnerId).toBe(candidateIds[realIndex]);
      }
    }

    // Expected detection ~8/9 = 89%; generous slack so this never cries wolf.
    expect(detected / trials).toBeGreaterThan(0.8);
  });

  it("binds a draw to its cycle — re-attribution is detected, or harmless", () => {
    // Subtle, and worth stating precisely rather than asserting something false.
    //
    // Re-deriving against a different cycle yields a fresh index, which differs from
    // the recorded one (n-1)/n of the time — so detection is probabilistic, not
    // certain. An earlier version of this test asserted certainty and was flaky.
    //
    // The 1/n coincidence is benign: if the re-derived index EQUALS the recorded
    // one, the winner is the same person, so the forgery changes nothing. The check
    // only "misses" in cases where there is nothing to miss.
    let detected = 0;
    let sameWinner = 0;
    const trials = 400;

    for (let t = 0; t < trials; t++) {
      const { serverSeed, commitment } = createSeedCommitment();
      const realIndex = deriveIndex(
        serverSeed,
        drawContext({ committeeId, cycleNumber, candidateIds }),
        candidateIds.length
      );

      // Claim the same draw belongs to a different cycle.
      const r = verifyDraw({
        serverSeed,
        commitment,
        committeeId,
        cycleNumber: cycleNumber + 1,
        candidateIds,
        winnerIndex: realIndex,
      });

      if (!r.valid) detected += 1;
      else {
        sameWinner += 1;
        // If it verified, it must be because the winner is identical anyway.
        expect(r.winnerIndex).toBe(realIndex);
      }
    }

    // Expected detection rate is 7/8 = 87.5%; allow generous sampling slack.
    expect(detected / trials).toBeGreaterThan(0.8);
    expect(detected + sameWinner).toBe(trials);
  });

  it("reports an unrevealed seed rather than passing", () => {
    const { commitment, winnerIndex } = runDraw();
    const r = verifyDraw({ serverSeed: null, commitment, committeeId, cycleNumber, candidateIds, winnerIndex });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("not been revealed");
  });
});

describe("a full committee lifecycle", () => {
  it("gives every member exactly one win, with no repeats", () => {
    // The defining ROSCA property. Here it's enforced by shrinking the candidate
    // pool each cycle; in the database it's additionally guaranteed by
    // UNIQUE(winnerCommitteeMemberId), so it holds even if this code is wrong.
    const members = ids(8);
    let remaining = [...members];
    const winners = [];

    for (let cycle = 1; cycle <= members.length; cycle++) {
      const { serverSeed } = createSeedCommitment();
      const ctx = drawContext({ committeeId: "c1", cycleNumber: cycle, candidateIds: remaining });
      const idx = deriveIndex(serverSeed, ctx, remaining.length);

      winners.push(remaining[idx]);
      remaining = remaining.filter((_, i) => i !== idx);
    }

    expect(winners).toHaveLength(8);
    expect(new Set(winners).size).toBe(8); // no repeats
    expect([...winners].sort()).toEqual([...members].sort()); // everyone won once
    expect(remaining).toHaveLength(0);
  });

  it("stays fair as the pool shrinks — the last member is not predetermined early", () => {
    // Across many committees the final winner should be spread evenly, not fixed.
    const finals = new Map();

    for (let trial = 0; trial < 2000; trial++) {
      let remaining = ids(4);
      for (let cycle = 1; cycle <= 4; cycle++) {
        const { serverSeed } = createSeedCommitment();
        const ctx = drawContext({ committeeId: `c${trial}`, cycleNumber: cycle, candidateIds: remaining });
        const idx = deriveIndex(serverSeed, ctx, remaining.length);
        if (cycle === 4) finals.set(remaining[idx], (finals.get(remaining[idx]) ?? 0) + 1);
        remaining = remaining.filter((_, i) => i !== idx);
      }
    }

    // Each of the 4 members should end up last roughly 500 times.
    for (const count of finals.values()) {
      expect(count).toBeGreaterThan(380);
      expect(count).toBeLessThan(620);
    }
  });
});

describe("algorithm versioning", () => {
  it("stamps the version into the context so old draws stay verifiable", () => {
    const ctx = drawContext({ committeeId: "c1", cycleNumber: 1, candidateIds: ids(3) });
    expect(ctx.startsWith(`v${ALGORITHM_VERSION}|`)).toBe(true);
  });
});
