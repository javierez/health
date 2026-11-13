import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { asOwner } from "~/db";
import { env } from "~/env";
import { appleHealthSchema, ingestAppleHealth } from "~/server/edge/apple-health";
import { edgePushSchema, ingestEdge, keepPush } from "~/server/edge/ingest";

/**
 * The band without the WHOOP subscription: OpenStrap Edge posting its own
 * numbers (`server/edge/ingest.ts`), or Health Auto Export posting the Apple
 * Health that Edge wrote (`server/edge/apple-health.ts`, a body with `data`).
 * `Authorization: Bearer <EDGE_PUSH_SECRET>`. Every distinct body is kept as
 * it came (`edge_pushes`) before either reads it.
 */
export async function POST(request: Request) {
  // His band, his rows (`~/db`): nobody is signed in on a webhook.
  return asOwner(() => receive(request));
}

async function receive(request: Request) {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${env.EDGE_PUSH_SECRET ?? ""}`);
  if (!env.EDGE_PUSH_SECRET || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  const text = await request.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON: the schemas below turn it away.
  }
  if (body && typeof body === "object") await keepPush(text, body).catch((e) => console.error("[edge] keep push", e));
  if (body && typeof body === "object" && "data" in body) {
    const parsed = appleHealthSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.message }, { status: 400 });
    const data = await ingestAppleHealth(parsed.data);
    console.log("[edge] apple health", data);
    return NextResponse.json({ success: true, data });
  }

  const parsed = edgePushSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 400 });
  }
  return NextResponse.json({ success: true, data: await ingestEdge(parsed.data) });
}
