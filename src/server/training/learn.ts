import { and, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "~/db";
import { exerciseMoves, kinds, type FactData, type MoveInfo } from "~/db/schema";
import { exerciseName, exerciseOf, sportOf, ZONES, zonesIn, type Work } from "~/lib/exercises";
import { bakedFor, kindKey } from "~/lib/renders";
import { sinRayas } from "~/lib/sin-rayas";
import { later, paint } from "~/server/kinds";
import { research } from "~/server/web-research";

/**
 * Every exercise or sport he does is learned once, after the reply (Javier,
 * 18-oct-2026: «un ejercicio que desconoces… hacer research… una
 * representación 3D del ejercicio, si es con movimiento pues también»).
 *
 * 1. The web: how it is done, what it works and its two poses. The catalog in
 *    `~/lib/exercises` keeps its own muscles; the web fills the ones it lacks.
 * 2. One drawing with both poses, start and end: the app alternates them and
 *    it moves.
 */
export const PROMPT_VERSION = "move-info-v1";
const MAX_ATTEMPTS = 3;
const STALE_MS = 5 * 60_000;

export const SYSTEM = `Buscas en internet cómo se hace un ejercicio o un deporte que hace Javier y qué músculos trabaja. Mira guías de entrenamiento serias (ExRx, ACE, NSCA, estudios de EMG) y luego llama a «movimiento».

- Músculos solo de la lista. principal: el que trabaja de verdad; ayuda: los que colaboran; sujeta: los que estabilizan. Tres a seis en total.
- Si es un deporte o algo que se mide por tiempo (yoga, boxeo, natación), di su intensidad para los músculos.
- inicio y final: las dos posiciones del movimiento, en inglés, para un ilustrador: postura, material y en qué parte del recorrido. Una frase cada una. Si se aguanta quieto (pared, plancha), inicio es cómo se coloca antes (de pie contra la pared, rodillas en el suelo) y final la postura aguantada, con lo que se levanta en el aire.
- Español en el resto, frases cortas. Nunca uses rayas largas ni medias.`;

export const MOVE = {
  name: "movimiento",
  description: "Cómo se hace y qué trabaja, con lo encontrado en la web.",
  input_schema: {
    type: "object" as const,
    properties: {
      como: { type: "string", description: "Cómo se hace, 15 palabras como mucho, sin anglicismos. «Tumbado en un banco, bajas la barra al pecho y la empujas.»" },
      musculos: {
        type: "array",
        items: {
          type: "object",
          properties: { musculo: { type: "string", enum: [...ZONES] }, papel: { type: "string", enum: ["principal", "ayuda", "sujeta"] } },
          required: ["musculo", "papel"],
        },
      },
      intensidad: { type: "string", enum: ["suave", "media", "dura"], description: "Solo si se mide por tiempo." },
      inicio: { type: "string" },
      final: { type: "string" },
      fuentes: {
        type: "array",
        items: { type: "object", properties: { titulo: { type: "string" }, url: { type: "string" } }, required: ["titulo", "url"] },
      },
    },
    required: ["como", "musculos", "inicio", "final", "fuentes"],
  },
};

const ROLE = { principal: 1, ayuda: 0.5, sujeta: 0.25 } as const;
/** A sport's 30 minutes against a set: a walk gives half of what a run does. */
const INTENSITY = { suave: 0.5, media: 0.75, dura: 1 } as const;

/** Too long is cut, not refused: one wordy line must not lose the whole move. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .transform((t) => (t.length <= max ? t : `${t.slice(0, t.lastIndexOf(" ", max - 1)).replace(/[,;:.]$/, "")}…`));
const items = <T extends z.ZodTypeAny>(item: T) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((xs) => xs.flatMap((x): z.output<T>[] => {
      const r = item.safeParse(x);
      return r.success ? [r.data] : [];
    }));
const moveSchema = z.object({
  como: text(160),
  musculos: items(z.object({ musculo: z.enum(ZONES), papel: z.enum(["principal", "ayuda", "sujeta"]) })),
  intensidad: z.enum(["suave", "media", "dura"]).optional().catch(undefined),
  inicio: text(300),
  final: text(300),
  fuentes: items(z.object({ titulo: text(160), url: z.string().url().startsWith("http") })),
});

/** What the model filled in; null without a muscle or a pose. A muscle said twice keeps its biggest role. */
export function parseMove(input: unknown, byTime: boolean): MoveInfo | null {
  const m = moveSchema.safeParse(input);
  if (!m.success || m.data.musculos.length === 0) return null;
  const scale = byTime ? INTENSITY[m.data.intensidad ?? "media"] : 1;
  const work: Work = {};
  for (const { musculo, papel } of m.data.musculos) work[musculo] = Math.max(work[musculo] ?? 0, ROLE[papel] * scale);
  return {
    how: sinRayas(m.data.como),
    work,
    start: m.data.inicio,
    end: m.data.final,
    sources: m.data.fuentes.slice(0, 5).map((s) => ({ title: sinRayas(s.titulo), url: s.url })),
  };
}

/**
 * Both poses in one wide drawing, left the start and right the end: one
 * drawing keeps the same mannequin, camera and scale, which two separate ones
 * never did (the second came out smaller and moved, 18-oct-2026). The app
 * shows one half and then the other.
 */
const PAIR = (name: string, start: string, end: string) =>
  [
    `Two panels side by side in one image: the two ends of one rep of the exercise «${name}» (Spanish), as a two-frame animation.`,
    `Left panel: ${start}. Right panel: ${end}. The full range of the movement: the two poses must look clearly different even at icon size.`,
    "The same faceless articulated mannequin in brushed aluminium in both, like an artist's posing model: no face, no skin, no hair, no clothes.",
    "Its equipment in matte off-white clay. Same camera, same clear side view, same scale, the floor at the same height in both panels, filling about 70% of each half.",
    "The halves are laid over each other in the app: whatever does not move in this exercise (a bench, a machine, the feet on the floor) sits at exactly the same spot within its half, so only the moving parts change.",
    "Copy exactly the style of the rendered reference images, never their objects: realistic 3D render, soft studio light from the top left, gentle contact shadow.",
    "Only the mannequin and its equipment. Transparent background. No divider, no arrows, no text, no letters, no logos, nothing cartoonish.",
  ].join(" ");

/** The drawing of a move, as a kind: `/api/icon/mov-<key>`, left half the start, right half the end. */
export const moveIcon = (key: string) => `mov-${key}`;

/** The name it is kept under: the catalog's for a synonym («press de banca» → «Press banca»), its own for a variant. */
const canonical = (name: string) => (exerciseOf(name) ? exerciseName(name) : (sportOf(name)?.name ?? name.trim()));

/** The key of a move, creating it if new and learning it after the reply. */
export async function ensureMove(name: string, byTime: boolean): Promise<string | null> {
  const shown = canonical(name);
  const key = kindKey(shown);
  if (!key) return null;
  await db.insert(exerciseMoves).values({ key, name: shown, byTime }).onConflictDoNothing();
  const [row] = await db.select().from(exerciseMoves).where(eq(exerciseMoves.key, key));
  const stale = row && ["searching", "drawing"].includes(row.status) && Date.now() - row.updatedAt.getTime() > STALE_MS;
  if (row && (row.status === "pending" || (row.status === "failed" && row.attempts < MAX_ATTEMPTS) || stale)) later(() => learnMove(key));
  return key;
}

/** The web, then the two drawings. Claims the row first, so two calls never pay twice. */
export async function learnMove(key: string): Promise<{ ok: boolean; error?: string }> {
  const [row] = await db
    .update(exerciseMoves)
    .set({ status: "searching", attempts: sql`${exerciseMoves.attempts} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(exerciseMoves.key, key),
        sql`(${exerciseMoves.status} in ('pending', 'failed') or (${exerciseMoves.status} in ('searching', 'drawing') and ${exerciseMoves.updatedAt} < ${new Date(Date.now() - STALE_MS).toISOString()}::timestamptz))`,
        lt(exerciseMoves.attempts, MAX_ATTEMPTS),
      ),
    )
    .returning();
  if (!row) return { ok: false, error: "ya aprendido o en curso" };

  try {
    // A retry after a failed drawing keeps what the web already said.
    let info = row.info;
    if (!info) {
      const ask = `${row.byTime ? "Deporte o actividad por tiempo" : "Ejercicio"}: ${row.name}.`;
      info = parseMove(await research(SYSTEM, MOVE, ask), row.byTime);
      if (!info) throw new Error("sin músculos o sin posturas");
      await db.update(exerciseMoves).set({ info, status: "drawing", updatedAt: new Date() }).where(eq(exerciseMoves.key, key));
    }
    const icon = await paint(PAIR(row.name, info.start, info.end), { wide: true });
    await db
      .insert(kinds)
      .values({ key: moveIcon(key), name: row.name, icon, status: "ready" })
      .onConflictDoUpdate({ target: [kinds.userId, kinds.key], set: { icon, status: "ready", error: null, updatedAt: new Date() } });
    await db.update(exerciseMoves).set({ status: "ready", error: null, updatedAt: new Date() }).where(eq(exerciseMoves.key, key));
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.update(exerciseMoves).set({ status: "failed", error, updatedAt: new Date() }).where(eq(exerciseMoves.key, key));
    return { ok: false, error };
  }
}

/** What a training says it was: each exercise by sets, else the sport or the new thing by time. */
export function movesIn(f: { kind: string; summary: string; data: FactData; tipo?: string | null }): { name: string; byTime: boolean }[] {
  if (f.kind !== "training") return [];
  const exercises = f.data.exercises ?? [];
  if (exercises.length > 0) return exercises.map((e) => ({ name: e.name, byTime: false }));
  const sport = f.data.training === "run" ? sportOf("correr") : sportOf(f.tipo ?? f.summary);
  if (sport) return [{ name: sport.name, byTime: true }];
  // «Gimnasio: pierna» says where, not what: nothing to learn.
  if (!f.tipo || bakedFor(f.tipo) || zonesIn(f.summary).length > 0) return [];
  return [{ name: f.tipo, byTime: true }];
}

/** After a training is written: each move it names, learned once. */
export function learnMovesLater(rows: { kind: string; summary: string; data: FactData; tipo?: string | null }[]) {
  const moves = rows.flatMap(movesIn);
  if (moves.length === 0) return;
  later(async () => {
    for (const m of moves) await ensureMove(m.name, m.byTime);
  });
}
