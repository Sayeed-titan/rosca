/**
 * Schema regression tests.
 *
 * These exist because of a real bug: the member and committee schemas originally
 * used `.transform()` ("" -> null, "YYYY-MM-DD" -> Date). zodResolver hands the form
 * its *parsed output*, so the browser submitted already-transformed values, and the
 * Server Action then re-parsed them with the same schema — which expected raw
 * strings. Every create failed with "expected string, received null".
 *
 * The rule these lock in: because the schema runs on BOTH sides, it must be able to
 * parse its own output. Validation and normalisation stay separate.
 */
import { describe, it, expect } from "vitest";

import {
  memberSchema,
  memberUpdateSchema,
  normalizeMemberInput,
} from "@/features/members/schema";
import {
  committeeSchema,
  normalizeCommitteeInput,
} from "@/features/committees/schema";

const validMember = {
  fullName: "Rahima Akter",
  phone: "+8801711000001",
  email: "",
  nationalId: "",
  address: "",
  occupation: "Tailor",
  emergencyContact: "",
  photoUrl: "",
  notes: "",
  status: "ACTIVE",
  joiningDate: "2026-01-05",
};

describe("memberSchema is idempotent", () => {
  it("parses its own output — the double-validation contract", () => {
    const once = memberSchema.parse(validMember);
    // The Server Action re-parses what the client sent. This must not throw.
    expect(() => memberSchema.parse(once)).not.toThrow();
    expect(memberSchema.parse(once)).toEqual(once);
  });

  it("accepts empty strings for optional fields", () => {
    expect(memberSchema.safeParse(validMember).success).toBe(true);
  });

  it("does not emit nulls or Dates (which broke the second parse)", () => {
    const parsed = memberSchema.parse(validMember);
    for (const value of Object.values(parsed)) {
      expect(value).not.toBeNull();
      expect(value instanceof Date).toBe(false);
    }
  });

  it("still rejects genuinely bad input", () => {
    expect(memberSchema.safeParse({ ...validMember, fullName: "R" }).success).toBe(false);
    expect(memberSchema.safeParse({ ...validMember, phone: "123" }).success).toBe(false);
    expect(memberSchema.safeParse({ ...validMember, email: "nope" }).success).toBe(false);
    expect(memberSchema.safeParse({ ...validMember, status: "KING" }).success).toBe(false);
  });

  it("requires an id on update", () => {
    expect(memberUpdateSchema.safeParse(validMember).success).toBe(false);
    expect(memberUpdateSchema.safeParse({ ...validMember, id: "abc" }).success).toBe(true);
  });
});

describe("normalizeMemberInput", () => {
  it("turns blank optional strings into null, not empty string", () => {
    // "" would collide on Member_organizationId_nationalId_key; NULLs don't.
    const out = normalizeMemberInput(memberSchema.parse(validMember));
    expect(out.nationalId).toBeNull();
    expect(out.email).toBeNull();
    expect(out.address).toBeNull();
  });

  it("keeps real values and trims them", () => {
    const out = normalizeMemberInput(
      memberSchema.parse({ ...validMember, nationalId: "  1990111  " })
    );
    expect(out.nationalId).toBe("1990111");
  });

  it("converts the date string to a Date", () => {
    const out = normalizeMemberInput(memberSchema.parse(validMember));
    expect(out.joiningDate).toBeInstanceOf(Date);
    expect(out.joiningDate.toISOString().slice(0, 10)).toBe("2026-01-05");
  });
});

const validCommittee = {
  name: "Mirpur Monthly",
  description: "",
  contribution: "5000",
  currency: "BDT",
  totalSeats: 8,
  startDate: "2026-01-05",
  endDate: "",
  drawFrequency: "MONTHLY",
  drawDay: 5,
  gracePeriodDays: 3,
  lateFeeType: "NONE",
  lateFeeFlat: "",
  lateFeePercent: "",
  status: "ACTIVE",
};

describe("committeeSchema is idempotent", () => {
  it("parses its own output", () => {
    const once = committeeSchema.parse(validCommittee);
    expect(() => committeeSchema.parse(once)).not.toThrow();
  });

  it("keeps money as a string, never a number", () => {
    const parsed = committeeSchema.parse(validCommittee);
    expect(typeof parsed.contribution).toBe("string");
  });

  it("rejects money that isn't a plain amount", () => {
    for (const bad of ["5,000", "abc", "5000.999", "-5000", ""]) {
      expect(
        committeeSchema.safeParse({ ...validCommittee, contribution: bad }).success
      ).toBe(false);
    }
  });
});

describe("committee cross-field rules", () => {
  it("rejects a weekly draw day above 7", () => {
    const r = committeeSchema.safeParse({
      ...validCommittee,
      drawFrequency: "WEEKLY",
      drawDay: 15,
    });
    expect(r.success).toBe(false);
  });

  it("requires the amount when the late fee is FLAT", () => {
    expect(
      committeeSchema.safeParse({ ...validCommittee, lateFeeType: "FLAT" }).success
    ).toBe(false);
    expect(
      committeeSchema.safeParse({
        ...validCommittee,
        lateFeeType: "FLAT",
        lateFeeFlat: "100",
      }).success
    ).toBe(true);
  });

  it("rejects an end date before the start date", () => {
    expect(
      committeeSchema.safeParse({
        ...validCommittee,
        endDate: "2025-01-01",
      }).success
    ).toBe(false);
  });

  it("requires at least 2 members — a ROSCA of one is not a ROSCA", () => {
    expect(
      committeeSchema.safeParse({ ...validCommittee, totalSeats: 1 }).success
    ).toBe(false);
  });
});

describe("normalizeCommitteeInput — money conversion", () => {
  it("converts a decimal amount to exact minor units", () => {
    const out = normalizeCommitteeInput(
      committeeSchema.parse({ ...validCommittee, contribution: "2500.75" })
    );
    expect(out.contributionMinor).toBe(250075n);
  });

  it("computes a pot with no float drift", () => {
    // The float version of this is 15004.499999999998.
    const out = normalizeCommitteeInput(
      committeeSchema.parse({
        ...validCommittee,
        contribution: "2500.75",
        totalSeats: 6,
      })
    );
    expect(out.contributionMinor * BigInt(out.totalSeats)).toBe(1500450n);
  });

  it("converts a percentage to integer basis points", () => {
    const out = normalizeCommitteeInput(
      committeeSchema.parse({
        ...validCommittee,
        lateFeeType: "PERCENT",
        lateFeePercent: "2.5",
      })
    );
    expect(out.lateFeePercentBps).toBe(250); // 2.50%
  });

  it("zeroes the fee fields that don't apply", () => {
    const out = normalizeCommitteeInput(
      committeeSchema.parse({ ...validCommittee, lateFeeType: "NONE" })
    );
    expect(out.lateFeeFlatMinor).toBe(0n);
    expect(out.lateFeePercentBps).toBe(0);
  });
});
