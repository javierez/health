import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { env } from "~/env";
import { authorizeUrl, exchangeCode } from "~/server/whoop/client";

/**
 * Both halves of the WHOOP OAuth flow on ONE route, because WHOOP validates the
 * redirect URI against the dashboard byte for byte: a second route would be a
 * second thing to register and a second thing to get wrong.
 *
 * Hit it with no query and it sends you to WHOOP. WHOOP sends you back here
 * with `?code=&state=`, and that branch stores the grant.
 */
export const dynamic = "force-dynamic";

const STATE_COOKIE = "whoop_state";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 400 });
  }

  if (!code) {
    if (!env.WHOOP_CLIENT_ID || !env.WHOOP_REDIRECT_URI) {
      return NextResponse.json(
        { ok: false, error: "set WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET and WHOOP_REDIRECT_URI" },
        { status: 500 },
      );
    }
    // WHOOP rejects a state shorter than eight characters.
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

  return NextResponse.redirect(new URL("/?whoop=connected", url.origin));
}
