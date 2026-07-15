/**
 * Next 16 renamed `middleware` to `proxy`. The filename, the exported function name
 * and the config flags all changed — any guide showing `middleware.js` predates this,
 * including Auth.js v5's own documentation.
 *
 * THIS IS AN OPTIMISTIC CHECK ONLY. It looks for the presence of a session cookie;
 * it does not verify the signature, expiry, or the user's permissions. Next's own
 * docs are explicit that proxy "should not be used as a full session management or
 * authorization solution".
 *
 * So this is a redirect for UX — it saves a signed-out visitor from loading a
 * dashboard shell only to be bounced. It is NOT a security boundary. Anyone can
 * forge this cookie's *presence*. Real enforcement happens in the service layer via
 * requireOrgActor() + assertCan(), which validate the session and the permission
 * against the database on every call.
 */
import { NextResponse } from "next/server";

/** Reachable while signed out. */
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth", // Auth.js endpoints must stay open or sign-in cannot happen
  "/api/health",
];

/**
 * Auth.js v5 cookie names. The __Secure- prefix is used over HTTPS.
 * Only presence is checked — see the caveat above.
 */
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function proxy(request) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const hasSessionCookie = SESSION_COOKIES.some((c) => request.cookies.has(c));

  if (!hasSessionCookie) {
    const url = new URL("/login", request.url);
    // Send them back where they were headed once they sign in.
    if (pathname && pathname !== "/") {
      url.searchParams.set("callbackUrl", pathname);
    }
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip static assets and image optimisation; they don't need auth and matching
  // them would just add latency to every asset.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
