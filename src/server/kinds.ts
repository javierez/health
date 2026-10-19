import { after } from "next/server";
import { and, eq, lt, sql } from "drizzle-orm";

import { db } from "~/db";
import { kinds } from "~/db/schema";
import { env } from "~/env";
import { bakedFor, kindKey } from "~/lib/renders";

/** Three baked renders the model copies the style from. */
const REFERENCES = ["gym", "pill", "book"];
/** A draw that hasn't finished in this long is taken as dead and retried. */
const STALE_MS = 3 * 60_000;
const MAX_ATTEMPTS = 3;
/** A WhatsApp photo is ~200 KB; past this it is not a photo worth copying. */
const MAX_REFERENCE = 4_000_000;

const PROMPT = (name: string, photo: boolean) =>
  [
    photo
      ? `The last image is a photo of the real «${name}». Draw that same object (its shape, cap, proportions) as a small app icon, recognisable at a glance.`
      : `Draw one object that anyone would recognise as «${name}» (Spanish), as a small app icon.`,
    "Copy exactly the style of the rendered reference images, never the photo: realistic 3D render, brushed aluminium and matte off-white clay,",
    "soft studio light from the top left, gentle contact shadow, three-quarter view, centred, filling about 70% of the frame.",
    "Transparent background. No text, no letters, no logos, no people, no faces, nothing cartoonish or childish.",
  ].join(" ");

/**
 * The key for a kind he named, creating it if new. A name the baked renders
 * cover («gimnasio», «la vitamina») returns that render's key and draws
 * nothing. A new one is drawn after the response, so the chat never waits.
 *
 *   ensureKind("Natación") → "natacion"
 *
 * With a photo of the real thing (a product), it is always its own icon,
 * drawn to look like his tube or his jar.
 */
export async function ensureKind(name: string, photo?: { data: Buffer; mime: string }): Promise<string> {
  const baked = photo ? null : bakedFor(name);
  if (baked) return baked;
  const key = kindKey(name);
  if (!key) return "habit";

  const reference = photo && photo.data.length <= MAX_REFERENCE ? { reference: photo.data.toString("base64"), referenceMime: photo.mime } : {};
  await db.insert(kinds).values({ key, name: name.trim(), ...reference }).onConflictDoNothing();
  const [row] = await db.select().from(kinds).where(eq(kinds.key, key));
  const stale = row && row.status === "drawing" && Date.now() - row.updatedAt.getTime() > STALE_MS;
  const due = row && (row.status === "pending" || (row.status === "failed" && row.attempts < MAX_ATTEMPTS) || stale);
  if (due) later(() => drawKind(key));
  return key;
}

/** In a request, after the response; in a script, now. */
export function later(job: () => Promise<unknown>) {
  try {
    after(job);
  } catch {
    void job();
  }
}

/** Draws the icon of one kind. Claims it first, so two calls never pay twice. */
export async function drawKind(key: string): Promise<{ ok: boolean; error?: string }> {
  if (!env.OPENAI_API_KEY) return { ok: false, error: "sin OPENAI_API_KEY" };
  const claimed = await db
    .update(kinds)
    .set({ status: "drawing", attempts: sql`${kinds.attempts} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(kinds.key, key),
        sql`(${kinds.status} in ('pending', 'failed') or (${kinds.status} = 'drawing' and ${kinds.updatedAt} < ${new Date(Date.now() - STALE_MS).toISOString()}::timestamptz))`,
        lt(kinds.attempts, MAX_ATTEMPTS),
      ),
    )
    .returning({ name: kinds.name, reference: kinds.reference, referenceMime: kinds.referenceMime });
  if (claimed.length === 0) return { ok: false, error: "ya dibujado o en curso" };

  try {
    const { name, reference, referenceMime } = claimed[0]!;
    const photo = reference ? { data: Buffer.from(reference, "base64"), mime: referenceMime ?? "image/jpeg" } : undefined;
    const icon = await paint(PROMPT(name, reference !== null), { photo });
    await db.update(kinds).set({ icon, status: "ready", error: null, updatedAt: new Date() }).where(eq(kinds.key, key));
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.update(kinds).set({ status: "failed", error, updatedAt: new Date() }).where(eq(kinds.key, key));
    return { ok: false, error };
  }
}

/**
 * One drawing in the style of the baked renders, base64 webp with
 * transparency. A photo of the real thing goes after the style references.
 * Wide: two panels, the two poses of a movement.
 */
export async function paint(prompt: string, { photo, wide = false }: { photo?: { data: Buffer; mime: string }; wide?: boolean } = {}): Promise<string> {
  if (!env.OPENAI_API_KEY) throw new Error("sin OPENAI_API_KEY");
  const form = new FormData();
  form.append("model", "gpt-image-1.5");
  form.append("prompt", prompt);
  form.append("size", wide ? "1536x1024" : "1024x1024");
  form.append("quality", "medium");
  form.append("background", "transparent");
  form.append("output_format", "webp");
  form.append("output_compression", "80");
  for (const ref of REFERENCES) {
    const res = await fetch(`${origin()}/renders/${ref}.webp`);
    if (!res.ok) throw new Error(`referencia ${ref}: ${res.status}`);
    form.append("image[]", new Blob([await res.arrayBuffer()], { type: "image/webp" }), `${ref}.webp`);
  }
  if (photo) form.append("image[]", new Blob([new Uint8Array(photo.data)], { type: photo.mime }), `foto.${photo.mime.split("/")[1] ?? "jpeg"}`);
  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(150_000),
  });
  if (!res.ok) throw new Error(`images ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const icon = ((await res.json()) as { data?: { b64_json?: string }[] }).data?.[0]?.b64_json;
  if (!icon) throw new Error("respuesta sin imagen");
  return icon;
}

/** Where the baked renders are served: they're public, so this fetch needs no cookie. */
function origin(): string {
  if (env.APP_URL) return env.APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3100";
}
