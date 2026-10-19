import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { authorizeUrl, exchangeCode, googleConfigured } from "~/server/google/client";

/**
 * Both halves of the Google OAuth flow on one route, like `/api/whoop/oauth`:
 * no query sends you to Google, `?code=&state=` stores the grant. Behind the
 * app password (see `~/proxy`), so only he can connect an account.
 */
export const dynamic = "force-dynamic";

const STATE_COOKIE = "google_state";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) return NextResponse.json({ ok: false, error }, { status: 400 });

  if (!code) {
    if (!googleConfigured()) {
      return NextResponse.json(
        { ok: false, error: "set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI" },
        { status: 500 },
      );
    }
    const state = randomBytes(16).toString("hex");
    const res = NextResponse.redirect(authorizeUrl(state));
    res.cookies.set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", maxAge: 600 });
    return res;
  }

  const expected = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);
  if (!expected || expected !== url.searchParams.get("state")) {
    return NextResponse.json({ ok: false, error: "state mismatch" }, { status: 400 });
  }

  const res = await exchangeCode(code);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.reason }, { status: 502 });
  return NextResponse.redirect(new URL("/?google=connected", url.origin));
}
