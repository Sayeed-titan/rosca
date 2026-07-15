/**
 * Error codes shared by the service layer and the UI.
 *
 * Codes are stable and machine-readable; messages are human-facing. Keeping them
 * in one place stops the same failure being described three different ways in
 * three different dialogs.
 */

export const ErrorCode = {
  UNAUTHENTICATED: "auth.unauthenticated",
  FORBIDDEN: "auth.forbidden",
  NO_ORGANIZATION: "auth.no_organization",

  VALIDATION: "validation.failed",
  NOT_FOUND: "resource.not_found",
  CONFLICT: "resource.conflict",

  DRAW_INCOMPLETE_PAYMENTS: "draw.incomplete_payments",
  DRAW_ALREADY_RUN: "draw.already_run",
  DRAW_NO_ELIGIBLE_MEMBERS: "draw.no_eligible_members",
  DRAW_OVERRIDE_REASON_REQUIRED: "draw.override_reason_required",

  PAYMENT_ALREADY_REVERSED: "payment.already_reversed",
  PAYMENT_NOT_REVERSIBLE: "payment.not_reversible",

  RATE_LIMITED: "rate.limited",
  INTERNAL: "internal.error",
};

/** Thrown when a caller lacks a permission. Never caught to "just continue". */
export class ForbiddenError extends Error {
  constructor(permission) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
    this.code = ErrorCode.FORBIDDEN;
    this.permission = permission;
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthenticatedError";
    this.code = ErrorCode.UNAUTHENTICATED;
  }
}

/**
 * Thrown when code tries to build a database client without a tenant scope.
 * This is always a programming error — see src/core/db/tenant.js.
 */
export class MissingTenantScopeError extends Error {
  constructor(model, operation) {
    super(
      `Refused to run ${model}.${operation} without an organization scope. ` +
        `Use forOrganization(orgId) — see src/core/db/tenant.js.`
    );
    this.name = "MissingTenantScopeError";
  }
}
