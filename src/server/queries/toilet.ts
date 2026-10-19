import { and, asc, eq, gte, lte } from "drizzle-orm";

import { db } from "~/db";
import { facts, type FactData } from "~/db/schema";
import { addDays, localClock, localDay, localMinutes } from "~/lib/day";
import { dayLine, detail, type ToiletTime } from "~/lib/toilet";

export interface ToiletRow {
  id: number;
  time: string;
  toilet: ToiletTime["toilet"];
  detail: string;
}

export interface ToiletView {
  /** Today's times, newest first. */
  today: ToiletRow[];
  todayLine: string | null;
  /** Today and the 7 before, newest first, only the days told: what the agent reads. */
  days: { day: string; line: string }[];
}

/** The toilet in the agent's context: today time by time, and the days before. */
export async function loadToilet(now = new Date()): Promise<ToiletView> {
  const today = localDay(now);
  const rows = await db
    .select({ id: facts.id, day: facts.day, at: facts.at, data: facts.data })
    .from(facts)
    .where(and(eq(facts.kind, "toilet"), gte(facts.day, addDays(today, -7)), lte(facts.day, today)))
    .orderBy(asc(facts.at));
  const told = rows.flatMap((r) => {
    const d = r.data as FactData;
    if (!d.toilet) return [];
    const t: ToiletTime = { toilet: d.toilet, feel: d.feel, bristol: d.bristol, symptoms: d.symptoms, durationMin: d.durationMin, minutes: localMinutes(r.at) };
    return [{ id: r.id, day: r.day, at: r.at, t }];
  });
  const on = (day: string) => told.filter((r) => r.day === day).map((r) => r.t);
  const back = Array.from({ length: 8 }, (_, i) => addDays(today, -i));

  return {
    today: told
      .filter((r) => r.day === today)
      .map((r) => ({ id: r.id, time: localClock(r.at), toilet: r.t.toilet, detail: detail(r.t) }))
      .reverse(),
    todayLine: on(today).length > 0 ? dayLine(on(today)) : null,
    days: back.flatMap((day) => (on(day).length > 0 ? [{ day, line: dayLine(on(day)) }] : [])),
  };
}
