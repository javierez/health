import { NextResponse } from "next/server";

import { getOrCreateScene } from "~/server/scenes/generate";

/**
 * On-demand scene generation. `GET /api/scenes?slug=sport:endurance`.
 *
 * Cached by slug in the `scenes` table, so the first viewer pays for it and
 * everyone after reads a row. `?force=1` re-rolls a scene that came out ugly.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ ok: false, detail: "slug is required" }, { status: 400 });
  }

  const result = await getOrCreateScene(slug, {
    brief: url.searchParams.get("brief") ?? undefined,
    force: url.searchParams.get("force") === "1",
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    cached: result.cached,
    slug: result.scene.slug,
    code: result.scene.code,
    caption: result.scene.caption,
  });
}
