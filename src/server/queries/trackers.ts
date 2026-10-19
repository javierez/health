import { and, asc, desc, eq, gte } from "drizzle-orm";

import { db } from "~/db";
import { facts, waDays, type FactData } from "~/db/schema";
import { addDays, localDay } from "~/lib/day";
import { byCategory, moodDays, moodOf, type MoodDay, type TrackedCategory } from "~/lib/trackers";

/** Everything he logged in the last `days`, category by category: «Datos → Lo que apuntas» and the agent's context. */
export async function loadTrackers(days = 30, now = new Date()): Promise<TrackedCategory[]> {
  const rows = await db
    .select({ kind: facts.kind, day: facts.day, summary: facts.summary, data: facts.data })
    .from(facts)
    .where(gte(facts.day, addDays(localDay(now), -days)))
    .orderBy(desc(facts.at));
  return byCategory(rows.map((r) => ({ ...r, data: r.data as FactData })));
}

/** His mood day by day, what he said and what his chats read: the chart in «Lo que apuntas». */
export async function loadMoods(days = 30, now = new Date()): Promise<MoodDay[]> {
  const today = localDay(now);
  const since = addDays(today, -days);
  const [told, read] = await Promise.all([
    db
      .select({ day: facts.day, data: facts.data })
      .from(facts)
      .where(and(eq(facts.kind, "other"), gte(facts.day, since)))
      .orderBy(asc(facts.at)),
    db.select({ day: waDays.day, mood: waDays.mood }).from(waDays).where(gte(waDays.day, since)),
  ]);
  const said = told.flatMap((r) => {
    const value = moodOf(r.data as FactData);
    return value === null ? [] : [{ day: r.day, value }];
  });
  return moodDays(said, read, today, days);
}
