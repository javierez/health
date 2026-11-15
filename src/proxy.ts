import { NextResponse, type NextRequest } from "next/server";

import { auth } from "~/lib/auth";

/**
 * 🚨 Everything behind his login. Until 16-oct-2026 the production URL
 * served every recording, summary and WHOOP number to anyone who had it, and
 * `/api/sync` ran a paid sweep for any GET. Medical notes live here now.
 *
 * Open: the login and better-auth's own routes, the webhooks (Pocket, WHOOP
 * and the WhatsApp chat each carry their own proof) and `/api/sync`, which
 * checks its own bearer. And a session's own page, `/e/<day>-<signature>`
 * (`~/server/training/link`), with its exercise drawings: a mannequin, nothing of his.
 */
const OPEN = ["/login", "/api/auth/", "/api/webhooks/", "/api/sync", "/e/", "/api/icon/mov-"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (OPEN.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const session = await auth.api.getSession({ headers: request.headers });
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  const back = pathname + request.nextUrl.search;
  if (back !== "/") login.searchParams.set("callbackUrl", back);
  return NextResponse.redirect(login);
}

export const config = {
  // The clay renders are public files with nothing of his: behind the login,
  // next/image fetches them without a cookie, gets the login page and breaks.
  matcher: ["/((?!_next/static|_next/image|renders/|brand/|favicon.ico|icon.png|apple-icon.png).*)"],
};
