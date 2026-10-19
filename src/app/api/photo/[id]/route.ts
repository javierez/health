import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "~/db";
import { photos } from "~/db/schema";

/** One of his photos (`photos`), behind his login like the rest of `/api`. A photo never changes. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ success: false, error: "not found" }, { status: 404 });
  const [row] = await db.select({ jpeg: photos.jpeg }).from(photos).where(eq(photos.id, id));
  if (!row) return NextResponse.json({ success: false, error: "not found" }, { status: 404 });
  return new NextResponse(Buffer.from(row.jpeg, "base64"), {
    headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=31536000, immutable" },
  });
}
