/**
 * A tiny Result type.
 *
 * Services return Result instead of throwing. Server Actions run at a trust
 * boundary the user can see: an uncaught throw there becomes an opaque "something
 * went wrong" digest in production, which tells the user nothing and tells us less.
 * Returning failures explicitly forces every caller to decide what to show.
 *
 * Genuinely exceptional things (a dead database, a bug) still throw — those are not
 * results, they're faults.
 */

export function ok(data) {
  return { ok: true, data };
}

/**
 * @param {string} code    stable, machine-readable (e.g. "payment.duplicate")
 * @param {string} message human-readable, safe to show a user
 * @param {object} [details] optional field-level detail, e.g. Zod's flattened errors
 */
export function err(code, message, details) {
  return { ok: false, error: { code, message, details } };
}

export const isOk = (r) => r.ok === true;
export const isErr = (r) => r.ok === false;

/** Unwrap or throw — only for call sites where a failure really is a bug. */
export function unwrap(result) {
  if (result.ok) return result.data;
  throw new Error(`${result.error.code}: ${result.error.message}`);
}
