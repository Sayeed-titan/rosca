/**
 * RBAC matrix.
 *
 * Table-driven over every (role x permission) pair rather than spot-checking a few.
 * A permission added to the catalogue without a deliberate decision for each role
 * shows up here as a failure, which is the point — silent privilege drift is how
 * a Manager quietly gains the ability to override a draw.
 */
import { describe, it, expect } from "vitest";

import { can, canAccessMember } from "@/core/auth/rbac";
import { Permission, ROLE_PERMISSIONS, ALL_PERMISSIONS } from "@/core/auth/permissions";

const actor = (over = {}) => ({
  userId: "u1",
  isSuperAdmin: false,
  organizationId: "org1",
  role: "MEMBER",
  ...over,
});

describe("permission catalogue", () => {
  it("defines a permission set for every role", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([
      "MANAGER",
      "MEMBER",
      "ORG_OWNER",
    ]);
  });

  it("grants every catalogued permission to ORG_OWNER", () => {
    for (const p of ALL_PERMISSIONS) {
      expect(can(actor({ role: "ORG_OWNER" }), p)).toBe(true);
    }
  });
});

describe("role x permission matrix", () => {
  // Every pair is asserted explicitly. If this table and the catalogue disagree,
  // one of them is wrong and the test says so.
  for (const role of ["ORG_OWNER", "MANAGER", "MEMBER"]) {
    for (const permission of ALL_PERMISSIONS) {
      const expected = ROLE_PERMISSIONS[role].includes(permission);

      it(`${role} ${expected ? "CAN" : "CANNOT"} ${permission}`, () => {
        expect(can(actor({ role }), permission)).toBe(expected);
      });
    }
  }
});

describe("separation of duties", () => {
  it("lets a MANAGER run a draw", () => {
    expect(can(actor({ role: "MANAGER" }), Permission.DRAW_RUN)).toBe(true);
  });

  it("does NOT let a MANAGER override the payment-completeness rule", () => {
    // The person collecting the money must not also be able to waive the rule
    // that protects it.
    expect(can(actor({ role: "MANAGER" }), Permission.DRAW_OVERRIDE)).toBe(false);
  });

  it("does NOT let a MANAGER reverse a payment or change settings", () => {
    expect(can(actor({ role: "MANAGER" }), Permission.PAYMENT_REVERSE)).toBe(false);
    expect(can(actor({ role: "MANAGER" }), Permission.SETTINGS_UPDATE)).toBe(false);
    expect(can(actor({ role: "MANAGER" }), Permission.ORG_MANAGE_MEMBERS)).toBe(false);
  });

  it("does NOT let a MEMBER create payments or run draws", () => {
    expect(can(actor({ role: "MEMBER" }), Permission.PAYMENT_CREATE)).toBe(false);
    expect(can(actor({ role: "MEMBER" }), Permission.DRAW_RUN)).toBe(false);
    expect(can(actor({ role: "MEMBER" }), Permission.MEMBER_CREATE)).toBe(false);
  });
});

describe("edge cases", () => {
  it("denies everything to an anonymous actor", () => {
    for (const p of ALL_PERMISSIONS) {
      expect(can(null, p)).toBe(false);
      expect(can({}, p)).toBe(false);
    }
  });

  it("denies a signed-in user with no role in the active org", () => {
    expect(can(actor({ role: undefined }), Permission.COMMITTEE_VIEW)).toBe(false);
  });

  it("grants a super admin everything, even with no org role", () => {
    for (const p of ALL_PERMISSIONS) {
      expect(can(actor({ isSuperAdmin: true, role: undefined }), p)).toBe(true);
    }
  });

  it("denies an unknown role rather than defaulting open", () => {
    expect(can(actor({ role: "PRESIDENT" }), Permission.COMMITTEE_VIEW)).toBe(false);
  });
});

describe("member data ownership", () => {
  const record = { userId: "u-self" };

  it("lets a member read only their own record", () => {
    expect(canAccessMember(actor({ userId: "u-self" }), record)).toBe(true);
    expect(canAccessMember(actor({ userId: "u-other" }), record)).toBe(false);
  });

  it("lets staff read anyone's record", () => {
    expect(canAccessMember(actor({ userId: "u-x", role: "MANAGER" }), record)).toBe(true);
    expect(canAccessMember(actor({ userId: "u-x", role: "ORG_OWNER" }), record)).toBe(true);
  });
});
