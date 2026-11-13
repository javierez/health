import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { env } from "~/env";
import type { Part } from "~/server/agent/parts";
import { DEFAULT_MODEL } from "~/server/classify/episodes";
import { ACROSS, contactSheets } from "./media";

/**
 * A training video read once, cheap, before the agent sees it (Javier,
 * 22-oct-2026: «lo más barato posible en tokens, que identifique todo»).
 * Sixty frames one by one to the agent were ~18k tokens and its thinking ran
 * out of room; three contact sheets in one forced call are ~8k, about four
 * cents, and the agent gets a few lines it saves like anything he writes.
 * Haiku was a cent but missed two of six exercises in his leg video; this
 * model got all six.
 */
export const PROMPT_VERSION = "video-read-v1";

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const SYSTEM = `Lees un vídeo de entreno de Javier. Te llega en hojas de contactos: cada hoja son hasta 20 fotogramas en orden, de izquierda a derecha y de arriba abajo, cinco por fila; después de cada hoja, el segundo de cada fotograma fila a fila.

Mira los 20 fotogramas de cada hoja uno a uno. Divide el vídeo en tramos. Un tramo es un ejercicio seguido; cambia cuando cambia la postura, el material, el sitio o el plano (un montaje con cortes son varios tramos), aunque dure solo unos segundos. Por cada tramo:
- se_ve: primero la postura, sin nombrarla: de pie, sentado contra la pared, tumbado boca arriba, a cuatro patas con las rodillas en el aire; dónde están las manos, qué pierna trabaja, qué se mueve entre un fotograma y el siguiente.
- ejercicio: su nombre corriente en español, el que describe lo que se ve si no sabes el exacto ("Puente de glúteo a una pierna con banda", "Sentadilla isométrica en pared").
- reps: las repeticiones completas que se ven, contando cada vez que vuelve arriba. Sin reps si se aguanta quieto (pared, plancha).
- segundos: lo que dura el tramo, si se aguanta quieto.
- peso_kg: solo si se lee (discos, número en la mancuerna). Barra olímpica 20 kg.
- lado: izquierda, derecha o ambos, si es a una pierna o un brazo y se ve.
- material: banda, fitball, mancuernas, barra, máquina…
Tramos seguidos del mismo ejercicio (otro plano, la otra pierna) son uno. Lo que no es entrenar (descansar, caminar, colocar el material, mirar el móvil) va en descanso, no como tramo. Si es un montaje editado (cortes, unos segundos de cada ejercicio, rótulos), montaje true.

Posturas que se confunden, con su nombre:
- Espalda apoyada en la pared, muslos horizontales, quieto: sentadilla isométrica en pared; con una pierna en el aire, a una pierna.
- Un pie delante y otro detrás, baja la rodilla de atrás hacia el suelo sin moverse del sitio: zancada estática; con mancuernas en las manos, zancada estática con mancuernas. Si avanza, zancada caminando.
- Un pie atrás apoyado en un banco: sentadilla búlgara.
- Boca arriba, sube la cadera: puente de glúteo; con una pierna estirada o en el aire, a una pierna.
- A cuatro patas con las rodillas a un palmo del suelo, quieto: plancha de oso; si avanza, gateo de oso; si sube la cadera estirando las piernas y vuelve a bajar, oso a pica (es de pierna).
- De pie sobre una pierna, la otra delante, baja: sentadilla a una pierna; con un fitball entre la espalda y la pared, sentadilla a una pierna con fitball.
- Cadera atrás con la espalda recta y las piernas casi rectas: peso muerto rumano.`;

const TOOL: Anthropic.Tool = {
  name: "tramos",
  description: "Los ejercicios del vídeo, en orden.",
  input_schema: {
    type: "object",
    properties: {
      tramos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            desde: { type: "number" },
            hasta: { type: "number" },
            se_ve: { type: "string" },
            ejercicio: { type: "string" },
            reps: { type: "number" },
            segundos: { type: "number" },
            peso_kg: { type: "number" },
            lado: { type: "string", enum: ["izquierda", "derecha", "ambos"] },
            material: { type: "string" },
          },
          required: ["desde", "hasta", "se_ve", "ejercicio"],
        },
      },
      descanso: { type: "array", items: { type: "string" }, description: "«12 a 14 s: camina hacia la esterilla»" },
      montaje: { type: "boolean" },
    },
    required: ["tramos"],
  },
};

const num = z.coerce.number().nonnegative().optional().catch(undefined);
const reading = z.object({
  tramos: z
    .array(
      z.object({
        desde: z.coerce.number().catch(0),
        hasta: z.coerce.number().catch(0),
        ejercicio: z.string().trim().min(1),
        reps: num,
        segundos: num,
        peso_kg: num,
        lado: z.enum(["izquierda", "derecha", "ambos"]).optional().catch(undefined),
        material: z.string().trim().min(1).optional().catch(undefined),
      }),
    )
    .catch([]),
  descanso: z.array(z.string()).optional().catch(undefined),
  montaje: z.boolean().optional().catch(undefined),
});
export type VideoReading = z.infer<typeof reading>;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const SIDE = { izquierda: "lado izquierdo", derecha: "lado derecho" } as const;
const sec = (n: number) => String(Math.round(n));

/** What the agent reads instead of the frames: one line per stretch, then the rest. */
export function videoLines(input: unknown, length: number): string | null {
  // Sonnet sometimes hands the whole answer back as a JSON string inside `tramos`.
  const inner = (input as { tramos?: unknown } | null)?.tramos;
  const parsed = reading.safeParse(typeof inner === "string" ? safeJson(inner) : input);
  if (!parsed.success || parsed.data.tramos.length === 0) return null;
  const { tramos, descanso, montaje } = parsed.data;
  const lines = tramos.map((t) => {
    const detail = [
      t.reps ? `${t.reps} reps` : null,
      t.segundos ? `${sec(t.segundos)} s aguantando` : null,
      t.peso_kg ? `${t.peso_kg} kg` : null,
      t.lado && t.lado !== "ambos" ? SIDE[t.lado] : null,
      t.material ?? null,
    ].filter(Boolean);
    return `- ${sec(t.desde)} a ${sec(t.hasta)} s: ${t.ejercicio}${detail.length > 0 ? ` (${detail.join(", ")})` : ""}`;
  });
  return [
    `Lo que se ve en el vídeo (${sec(length)} s${montaje ? ", un montaje editado" : ""}), leído de sus fotogramas:`,
    ...lines,
    ...(descanso?.length ? [`Sin entrenar: ${descanso.join("; ")}.`] : []),
  ].join("\n");
}

/** «Hoja 2, fila 1: 16,8 · 17,7 …»: the second of each frame, row by row as they are drawn. */
export function sheetLegend(n: number, seconds: number[]): string {
  const rows = Array.from({ length: Math.ceil(seconds.length / ACROSS) }, (_, r) => seconds.slice(r * ACROSS, (r + 1) * ACROSS));
  return [`Hoja ${n}, segundo de cada fotograma:`, ...rows.map((r, i) => `fila ${i + 1}: ${r.join(" · ")}`)].join("\n");
}

/**
 * The video as text for the agent; the frames themselves if the read fails,
 * so a video never goes unread.
 */
export async function readVideo(frames: { second: number; jpeg: Buffer }[], known: string[] = []): Promise<Part> {
  const fallback: Part = { kind: "frames", frames };
  if (frames.length === 0) return fallback;
  try {
    const sheets = await contactSheets(frames);
    const content: Anthropic.ContentBlockParam[] = sheets.flatMap((s, i): Anthropic.ContentBlockParam[] => [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: s.jpeg.toString("base64") } },
      { type: "text", text: sheetLegend(i + 1, s.seconds) },
    ]);
    if (known.length > 0) content.push({ type: "text", text: `Nombres que ya usa (pon el suyo si es ese ejercicio): ${known.join(", ")}.` });
    const message = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 2_000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content }],
    });
    const block = message.content.find((c) => c.type === "tool_use");
    const last = frames[frames.length - 1]!.second;
    const text = videoLines(block?.type === "tool_use" ? block.input : null, last);
    return text ? { kind: "text", text } : fallback;
  } catch (err) {
    console.error("[video-read]", err);
    return fallback;
  }
}
