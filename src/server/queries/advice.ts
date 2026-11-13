import { and, eq, gte } from "drizzle-orm";

import { db } from "~/db";
import { facts, whoopRecords, type FactData } from "~/db/schema";
import { addDays, localDay, localMinutes } from "~/lib/day";
import { totals } from "~/lib/food";
import { advise, type Advice } from "~/server/assistant/evidence";
import type { Night } from "~/server/assistant/plan";
import { sessionsFrom, type Standing } from "~/server/commitments/standing";
import { loadFindings } from "./findings";
import { loadWeight } from "./food";

/** Today's evidence-backed advice, from his last week of data. */
export async function loadAdvice(now: Date, nights: Night[], bedMinutes: number, commitments: Standing[]): Promise<Advice[]> {
  const today = localDay(now);
  const weekday = ((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const monday = addDays(today, 1 - weekday);
  const [recent, workouts, told, weightKg, found] = await Promise.all([
    db
      .select({ at: facts.at, day: facts.day, data: facts.data })
      .from(facts)
      .where(and(eq(facts.kind, "meal"), gte(facts.day, addDays(today, -6)))),
    db
      .select({ label: whoopRecords.label, startAt: whoopRecords.startAt, durationSeconds: whoopRecords.durationSeconds, raw: whoopRecords.raw })
      .from(whoopRecords)
      .where(and(eq(whoopRecords.kind, "workout"), gte(whoopRecords.day, monday))),
    db
      .select({ at: facts.at, summary: facts.summary, data: facts.data })
      .from(facts)
      .where(and(eq(facts.kind, "training"), gte(facts.day, monday))),
    loadWeight(),
    loadFindings(),
  ]);
  const weekend = found.by.recovery.bad.find((f) => f.key === "weekend");

  const meals = recent.map((m) => ({ ...m, data: m.data as FactData }));
  const todays = meals.filter((m) => m.day === today);
  const caffeine = todays.filter((m) => m.data.caffeine).map((m) => localMinutes(m.at));
  const protein = todays.flatMap((m) => (m.data.proteinG === undefined ? [] : [m.data.proteinG]));
  const foods = todays.flatMap((m) => m.data.foods ?? []);
  const sport = sessionsFrom(workouts, told);
  const has = (a: string) => commitments.some((c) => c.commitment.activities.includes(a as never));

  return advise({
    nowMin: localMinutes(now),
    bedMinutes,
    nights: [...nights]
      .sort((a, b) => b.start.getTime() - a.start.getTime())
      .slice(0, 7)
      .map((n) => ({ bed: localMinutes(n.start), asleep: n.asleepMinutes ?? null })),
    drinksCaffeine: meals.some((m) => m.data.caffeine),
    lastCaffeine: caffeine.length > 0 ? Math.max(...caffeine) : null,
    alcoholDays: new Set(meals.filter((m) => m.data.alcohol && m.day >= addDays(today, -2)).map((m) => m.day)).size,
    proteinToday: protein.length > 0 ? protein.reduce((a, b) => a + b, 0) : null,
    fiberToday: foods.length > 0 ? totals(foods).fiberG : null,
    weightKg,
    strengthWeek: sport.filter((s) => s.activity === "gym").length,
    // Told without its minutes: half an hour, about his own (spin on WHOOP: 28 min median).
    cardioMinutesWeek: Math.round(sport.filter((s) => s.activity === "run" || s.activity === "bike").reduce((a, s) => a + (s.minutes ?? 30), 0)),
    weekday,
    covered: { strength: has("gym"), cardio: has("run") || has("bike") },
    weekendNights: weekend
      ? { recovery: Math.round(weekend.groups[0].mean), others: Math.round(weekend.groups[1].mean), nights: weekend.nights }
      : null,
  });
}
