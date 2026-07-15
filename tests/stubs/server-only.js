/**
 * No-op stand-in for the `server-only` package.
 *
 * `server-only` deliberately throws when imported outside a React Server Component,
 * which is exactly the guard we want in the app — it stops a service (and its
 * database credentials) ever being pulled into a client bundle.
 *
 * Vitest is a Node process, not a client bundle, so the guard has nothing to protect
 * here and would only prevent us testing the services at all. Aliased in
 * vitest.config.js rather than removed from the source.
 */
export {};
