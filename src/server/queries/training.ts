import { and, asc, eq, gte, isNotNull } from "drizzle-orm";
import { cache } from "react";

import { db } from "~/db";
import { exerciseMoves, facts, whoopRecords } from "~/db/schema";
import { addDays, localDay } from "~/lib/day";
import { exerciseName } from "~/lib/exercises";
import { pulseOf, scoreOf, statsOf, zonesOf, type PulseMinute, type Score, type WorkoutStats, type Zones } from "~/lib/workout";
import { linkFor, tokenFor } from "~/server/training/link";
import { doneOf, loadRoutines, prescription } from "~/server/training/routines";
import { learnedOf, summarize, type Learned, type Session, type Training } from "~/server/training/summary";

/** A year and a week: the heatmap's 53 weeks, and a lift climbing. */
const DAYS = 371;

export const loadTraining = cache(async (now = new Date()): Promise<Training> => {
  const today = localDay(now);
  const since = addDays(today, -DAYS);
  const [rows, whoop, moves, routines] = await Promise.all([
    db
      .select({ day: facts.day, summary: facts.summary, data: facts.data, at: facts.at })
      .from(facts)
      .where(and(eq(facts.kind, "training"), gte(facts.day, since)))
      .orderBy(asc(facts.at)),
    db
      .select({ day: whoopRecords.day, start: whoopRecords.startAt, end: whoopRecords.endAt, raw: whoopRecords.raw })
      .from(whoopRecords)
      .where(and(eq(whoopRecords.kind, "workout"), gte(whoopRecords.day, since), isNotNull(whoopRecords.startAt), isNotNull(whoopRecords.endAt))),
    db.select().from(exerciseMoves),
    loadRoutines(),
  ]);
  // One the web gave up on stops saying «aprendiendo».
  const learned: Learned[] = moves
    .filter((m) => m.info || m.status !== "failed" || m.attempts < 3)
    .map((m) => ({ key: m.key, name: m.name, byTime: m.byTime, work: m.info?.work ?? null, how: m.info?.how ?? null, drawn: m.status === "ready" }));
  const workouts = whoop.flatMap((w) => {
    if (!w.day || !w.start || !w.end) return [];
    const raw = w.raw as { sport_name?: string; score?: { strain?: number; average_heart_rate?: number; max_heart_rate?: number; kilojoule?: number } };
    const score = raw.score ?? {};
    return [
      {
        day: w.day,
        sport: raw.sport_name ?? "",
        minutes: (w.end.getTime() - w.start.getTime()) / 60_000,
        start: w.start,
        strain: score.strain != null ? Math.round(score.strain * 10) / 10 : null,
        avgHr: score.average_heart_rate ?? null,
        maxHr: score.max_heart_rate ?? null,
        kcal: score.kilojoule != null ? Math.round(score.kilojoule / 4.184) : null,
      },
    ];
  });
  const summary = summarize(rows, today, workouts, learned);
  return {
    ...summary,
    sessions: summary.sessions.map((s) => {
      const r = routines.find((x) => x.id === s.routineId);
      const names = r?.exercises.map((e) => e.name) ?? [];
      return r ? { ...s, routine: { name: r.name, done: doneOf(names, s.lines.map((l) => l.name)), of: names.length } } : s;
    }),
    routines: routines.map((r) => ({
      ...r,
      exercises: r.exercises.map((e) => ({ name: e.name, text: prescription(e), move: learnedOf(learned, exerciseName(e.name)) })),
    })),
  };
});

/** One session as its page shows it: the band's pulse while it lasted, its numbers, Pulso's score and its link. */
export interface WorkoutView {
  session: Session;
  pulse: PulseMinute[];
  zones: Zones | null;
  stats: WorkoutStats;
  score: Score;
  /** Whole, for the WhatsApp; and the path, for a link inside the app. */
  link: string;
  path: string;
}

export async function loadWorkout(day: string | undefined): Promise<WorkoutView | null> {
  if (!day) return null;
  const session = (await loadTraining()).sessions.find((s) => s.day === day);
  if (!session) return null;
  // Pulso's per-minute pulse (`/api/webhooks/edge`), since 14-nov-2026.
  // His max pulse, the one WHOOP measured (`body:me`), for the zones.
  const [[row], [body]] = await Promise.all([
    db.select({ raw: whoopRecords.raw }).from(whoopRecords).where(eq(whoopRecords.id, `metric:edge-heart_rate-${day}`)),
    db.select({ raw: whoopRecords.raw }).from(whoopRecords).where(eq(whoopRecords.id, "body:me")),
  ]);
  const pulse = pulseOf(row?.raw ?? null, session.span);
  const stats = statsOf(session, pulse);
  const maxHr = Number((body?.raw as { max_heart_rate?: unknown } | undefined)?.max_heart_rate);
  const zones = maxHr > 0 && pulse.length > 0 ? zonesOf(pulse, maxHr) : null;
  return { session, pulse, zones, stats, score: scoreOf(session, stats), link: linkFor(day), path: `/e/${tokenFor(day)}` };
}
