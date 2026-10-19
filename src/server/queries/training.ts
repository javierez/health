import { and, asc, eq, gte, isNotNull } from "drizzle-orm";
import { cache } from "react";

import { db } from "~/db";
import { exerciseMoves, facts, whoopRecords } from "~/db/schema";
import { addDays, localDay } from "~/lib/day";
import { summarize, type Learned, type Training } from "~/server/training/summary";

/** Half a year: enough to see a lift climb. */
const DAYS = 182;

export const loadTraining = cache(async (now = new Date()): Promise<Training> => {
  const today = localDay(now);
  const since = addDays(today, -DAYS);
  const [rows, whoop, moves] = await Promise.all([
    db
      .select({ day: facts.day, summary: facts.summary, data: facts.data })
      .from(facts)
      .where(and(eq(facts.kind, "training"), gte(facts.day, since)))
      .orderBy(asc(facts.at)),
    db
      .select({ day: whoopRecords.day, start: whoopRecords.startAt, end: whoopRecords.endAt, raw: whoopRecords.raw })
      .from(whoopRecords)
      .where(and(eq(whoopRecords.kind, "workout"), gte(whoopRecords.day, since), isNotNull(whoopRecords.startAt), isNotNull(whoopRecords.endAt))),
    db.select().from(exerciseMoves),
  ]);
  // One the web gave up on stops saying «aprendiendo».
  const learned: Learned[] = moves
    .filter((m) => m.info || m.status !== "failed" || m.attempts < 3)
    .map((m) => ({ key: m.key, name: m.name, byTime: m.byTime, work: m.info?.work ?? null, how: m.info?.how ?? null, drawn: m.status === "ready" }));
  const workouts = whoop.flatMap((w) =>
    w.day && w.start && w.end
      ? [{ day: w.day, sport: (w.raw as { sport_name?: string }).sport_name ?? "", minutes: (w.end.getTime() - w.start.getTime()) / 60_000 }]
      : [],
  );
  return summarize(rows, today, workouts, learned);
});
