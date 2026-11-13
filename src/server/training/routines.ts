import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "~/db";
import { exerciseMoves, facts, trainingRoutines, type RoutineExercise } from "~/db/schema";
import { sinRayas } from "~/lib/sin-rayas";

/**
 * His training routines: saved once with their exercises in order, and each
 * training that did all or part of one points at it (Javier, 22-oct-2026).
 */

const num = z.coerce.number().positive().optional().catch(undefined);
const exercise = z.object({
  nombre: z.string().trim().min(1).max(80),
  series: num,
  reps: num,
  segundos: num,
  peso_kg: num,
  nota: z.string().trim().min(1).max(60).optional().catch(undefined),
});
const routine = z.object({
  id: z.coerce.number().int().positive().optional().catch(undefined),
  nombre: z.string().trim().min(1).max(60),
  ejercicios: z.array(z.unknown()).catch([]),
});

const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export interface RoutineSave {
  id?: number;
  name: string;
  exercises: RoutineExercise[];
}

/** What the tool asked: the routines to save (new, or replacing one by id) and the ids to archive. */
export function parseRoutines(input: unknown): { save: RoutineSave[]; archive: number[] } {
  const o = (input ?? {}) as { guardar?: unknown; archivar?: unknown };
  const save = (Array.isArray(o.guardar) ? o.guardar : []).flatMap((raw): RoutineSave[] => {
    const r = routine.safeParse(raw);
    if (!r.success) return [];
    const exercises = r.data.ejercicios.flatMap((e): RoutineExercise[] => {
      const x = exercise.safeParse(e);
      if (!x.success) return [];
      const { nombre, series, reps, segundos, peso_kg, nota } = x.data;
      // «Puente con banda» with the note «con banda» said it twice.
      const note = nota && !plain(nombre).includes(plain(nota).replace(/^con /, "")) ? sinRayas(nota) : undefined;
      return [{ name: sinRayas(nombre), sets: series, reps, seconds: segundos, weightKg: peso_kg, note }];
    });
    return exercises.length > 0 ? [{ id: r.data.id, name: sinRayas(r.data.nombre), exercises }] : [];
  });
  const archive = (Array.isArray(o.archivar) ? o.archivar : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return { save, archive };
}

const kg = (n: number) => `${Number(n.toFixed(1)).toLocaleString("es-ES")} kg`;

/** «3×12 · 10 kg · por pierna», «3×30 s», «3 series». */
export function prescription(e: RoutineExercise): string {
  const each = e.reps ? `×${e.reps}` : e.seconds ? `×${e.seconds} s` : null;
  const work = e.sets ? (each ? `${e.sets}${each}` : `${e.sets} ${e.sets === 1 ? "serie" : "series"}`) : each ? each.slice(1) : null;
  return [work, e.weightKg ? kg(e.weightKg) : null, e.note ?? null].filter(Boolean).join(" · ");
}

/** One routine as the agent reads it: «[3] Rutina de pierna: 1. Sentadilla isométrica en pared (3×30 s); 2. …». */
export function routineLine(r: { id: number; name: string; exercises: RoutineExercise[] }): string {
  const list = r.exercises.map((e, i) => {
    const p = prescription(e);
    return `${i + 1}. ${e.name}${p ? ` (${p})` : ""}`;
  });
  return `- [${r.id}] ${r.name}: ${list.join("; ")}`;
}

export interface RoutineView {
  id: number;
  name: string;
  exercises: RoutineExercise[];
  /** The last training that did it, all or part, and how many of its exercises. */
  last: { day: string; done: number } | null;
}

/** How many of the routine's exercises a training did, by name. */
export function doneOf(routineNames: string[], did: string[]): number {
  const set = new Set(did.map(plain));
  return routineNames.filter((n) => set.has(plain(n))).length;
}

/** His active routines, newest first, each with the last day he did it. */
export async function loadRoutines(): Promise<RoutineView[]> {
  const [rows, used] = await Promise.all([
    db.select().from(trainingRoutines).where(eq(trainingRoutines.active, true)).orderBy(desc(trainingRoutines.updatedAt)),
    db
      .select({ day: facts.day, data: facts.data })
      .from(facts)
      .where(and(eq(facts.kind, "training"), sql`${facts.data} ? 'routineId'`))
      .orderBy(desc(facts.at))
      .limit(200),
  ]);
  return rows.map((r) => {
    const mine = used.filter((u) => u.data.routineId === r.id);
    const day = mine[0]?.day;
    const did = mine.filter((u) => u.day === day).flatMap((u) => u.data.exercises?.map((e) => e.name) ?? []);
    return {
      id: r.id,
      name: r.name,
      exercises: r.exercises,
      last: day ? { day, done: doneOf(r.exercises.map((e) => e.name), did) } : null,
    };
  });
}

/** The routines written, the archived ones off; returns a line per change. */
export async function saveRoutines({ save, archive }: { save: RoutineSave[]; archive: number[] }): Promise<string[]> {
  const lines: string[] = [];
  for (const r of save) {
    const values = { name: r.name, exercises: r.exercises, active: true, updatedAt: new Date() };
    const [row] = r.id
      ? await db.update(trainingRoutines).set(values).where(eq(trainingRoutines.id, r.id)).returning({ id: trainingRoutines.id })
      : await db.insert(trainingRoutines).values(values).returning({ id: trainingRoutines.id });
    if (row) lines.push(`[${row.id}] ${r.name}: ${r.exercises.length} ejercicios`);
    else lines.push(`No existe la rutina [${r.id}]`);
  }
  for (const id of archive) {
    const [row] = await db.update(trainingRoutines).set({ active: false }).where(eq(trainingRoutines.id, id)).returning({ name: trainingRoutines.name });
    if (row) lines.push(`Archivada: ${row.name}`);
  }
  return lines;
}

/** Names he already uses, so a video is read in his words: his routines' exercises, then what he has logged. */
export async function knownExercises(): Promise<string[]> {
  const [routines, moves] = await Promise.all([
    db.select({ exercises: trainingRoutines.exercises }).from(trainingRoutines).where(eq(trainingRoutines.active, true)),
    db.select({ name: exerciseMoves.name }).from(exerciseMoves).where(eq(exerciseMoves.byTime, false)),
  ]);
  return [...new Set([...routines.flatMap((r) => r.exercises.map((e) => e.name)), ...moves.map((m) => m.name)])];
}
