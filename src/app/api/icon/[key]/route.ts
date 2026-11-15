import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { asOwner, currentUserId, db } from "~/db";
import { kinds } from "~/db/schema";

/**
 * The icon drawn for a kind (`~/server/kinds`). Until it's drawn, the plain
 * habit render, uncached, so the real one shows on the next load. An
 * exercise's drawing (`mov-…`) also opens without his login, for a session's
 * own page (`src/proxy.ts`): read as his.
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  // Awaited inside: a drizzle query only runs when awaited, and outside `asOwner` it runs as no one.
  const read = async () => await db.select({ icon: kinds.icon }).from(kinds).where(eq(kinds.key, key));
  const [row] = key.startsWith("mov-") && !(await currentUserId()) ? await asOwner(read) : await read();
  if (!row?.icon) {
    return NextResponse.redirect(new URL("/renders/habit.webp", request.url), { status: 307, headers: { "cache-control": "no-store" } });
  }
  return new NextResponse(Buffer.from(row.icon, "base64"), {
    headers: { "content-type": "image/webp", "cache-control": "private, max-age=86400" },
  });
}
