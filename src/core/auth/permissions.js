/**
 * The permission catalogue and the role -> permission map.
 *
 * Why permissions rather than `if (role === "MANAGER")` scattered through the code:
 * role checks spread out and drift. When the rules live in one table, "what can a
 * Manager actually do?" is answerable by reading a file instead of grepping, and
 * the RBAC test can assert every role x permission pair exhaustively.
 *
 * Naming is `resource.action`.
 */

export const Permission = {
  // Organisation
  ORG_VIEW: "org.view",
  ORG_UPDATE: "org.update",
  ORG_MANAGE_MEMBERS: "org.manage_members", // invite users, change their roles

  // ROSCA participants
  MEMBER_VIEW: "member.view",
  MEMBER_CREATE: "member.create",
  MEMBER_UPDATE: "member.update",
  MEMBER_DELETE: "member.delete",

  // Committees
  COMMITTEE_VIEW: "committee.view",
  COMMITTEE_CREATE: "committee.create",
  COMMITTEE_UPDATE: "committee.update",
  COMMITTEE_DELETE: "committee.delete",
  COMMITTEE_ASSIGN_MEMBERS: "committee.assign_members",

  // Money
  PAYMENT_VIEW: "payment.view",
  PAYMENT_CREATE: "payment.create",
  /// Reversal is the only way to undo a payment, so it is its own permission.
  PAYMENT_REVERSE: "payment.reverse",
  RECEIPT_ISSUE: "receipt.issue",

  // Draws
  DRAW_VIEW: "draw.view",
  DRAW_RUN: "draw.run",
  /// Drawing despite incomplete collections. Deliberately separate from DRAW_RUN:
  /// the spec allows it only for admins, and it must never be a quiet side effect
  /// of being able to run a normal draw.
  DRAW_OVERRIDE: "draw.override",

  // Reporting & operations
  REPORT_VIEW: "report.view",
  AUDIT_VIEW: "audit.view",
  SETTINGS_VIEW: "settings.view",
  SETTINGS_UPDATE: "settings.update",

  /// Read-only view of one's own data (member portal).
  SELF_VIEW: "self.view",
};

const ALL_PERMISSIONS = Object.values(Permission);

/**
 * ORG_OWNER  — full control of their organisation, including overrides.
 * MANAGER    — day-to-day operations. Can run draws, but NOT override the
 *              payment-completeness rule, and cannot change org settings or roles.
 *              That separation is the point: the person doing the collecting
 *              shouldn't also be able to waive the rule that protects it.
 * MEMBER     — portal access to their own data only.
 */
export const ROLE_PERMISSIONS = {
  ORG_OWNER: ALL_PERMISSIONS,

  MANAGER: [
    Permission.ORG_VIEW,
    Permission.MEMBER_VIEW,
    Permission.MEMBER_CREATE,
    Permission.MEMBER_UPDATE,
    Permission.COMMITTEE_VIEW,
    Permission.COMMITTEE_CREATE,
    Permission.COMMITTEE_UPDATE,
    Permission.COMMITTEE_ASSIGN_MEMBERS,
    Permission.PAYMENT_VIEW,
    Permission.PAYMENT_CREATE,
    Permission.RECEIPT_ISSUE,
    Permission.DRAW_VIEW,
    Permission.DRAW_RUN,
    Permission.REPORT_VIEW,
    Permission.SETTINGS_VIEW,
    Permission.SELF_VIEW,
  ],

  MEMBER: [
    Permission.SELF_VIEW,
    Permission.COMMITTEE_VIEW,
    Permission.DRAW_VIEW,
    Permission.PAYMENT_VIEW,
  ],
};

export { ALL_PERMISSIONS };
