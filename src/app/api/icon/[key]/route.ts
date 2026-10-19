import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "~/db";
import { kinds } from "~/db/schema";

/**
 * The icon drawn for a kind (`~/server/kinds`). Until it's drawn, the plain
 * habit render, uncached, so the real one shows on the next load.
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const [row] = await db.select({ icon: kinds.icon }).from(kinds).where(eq(kinds.key, key));
  if (!row?.icon) {
    return NextResponse.redirect(new URL("/renders/habit.webp", request.url), { status: 307, headers: { "cache-control": "no-store" } });
  }
  return new NextResponse(Buffer.from(row.icon, "base64"), {
    headers: { "content-type": "image/webp", "cache-control": "private, max-age=86400" },
  });
}
