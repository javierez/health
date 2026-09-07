import { asc, sql } from "drizzle-orm";

import { db } from "~/db";
import { whoopRecords } from "~/db/schema";

/**
 * WHOOP, folded into one row per day.
 *
 * One row per day and not per record because the timeline is a day-per-card:
 * a cycle, its recovery and the night's sleep are three WHOOP objects that all
 * describe the same morning, and showing them as three lines would say the day
 * had three things in it.
 *
 * `null` on a field means WHOOP has nothing for that day — an unworn night, or
 * an activity it has not scored yet. It is never rendered as a zero: a missing
 * recovery and a recovery of 0 % are opposite facts.
 */
export interface WhoopWorkout {
  sport: string | null;
  seconds: number | null;
  strain: number | null;
}

export interface WhoopDay {
  day: string;
  /** Recovery %, 0–100. */
  recovery: number | null;
  /** Day strain, 0–21 on WHOOP's own scale. */
  strain: number | null;
  sleepSeconds: number | null;
  /** Sleep performance %, how much of the needed sleep was actually had. */
  sleepScore: number | null;
  workouts: WhoopWorkout[];
}

export async function listWhoopDays(): Promise<WhoopDay[]> {
  const rows = await db
    .select({
      day: whoopRecords.day,
      kind: whoopRecords.kind,
      score: whoopRecords.score,
      label: whoopRecords.label,
      durationSeconds: whoopRecords.durationSeconds,
    })
    .from(whoopRecords)
    .where(sql`${whoopRecords.day} is not null`)
    .orderBy(asc(whoopRecords.startAt));

  const byDay = new Map<string, WhoopDay>();

  for (const r of rows) {
    if (!r.day) continue;
    const d = byDay.get(r.day) ?? {
      day: r.day,
      recovery: null,
      strain: null,
      sleepSeconds: null,
      sleepScore: null,
      workouts: [],
    };

    if (r.kind === "recovery") d.recovery = r.score;
    if (r.kind === "cycle") d.strain = r.score;
    if (r.kind === "sleep") {
      // A day can hold a nap as well as the night. Sum the time, keep the
      // best performance score — the nap's own score is not the night's.
      d.sleepSeconds = (d.sleepSeconds ?? 0) + (r.durationSeconds ?? 0);
      if (r.score !== null && (d.sleepScore === null || r.score > d.sleepScore)) {
        d.sleepScore = r.score;
      }
    }
    if (r.kind === "workout") {
      d.workouts.push({ sport: r.label, seconds: r.durationSeconds, strain: r.score });
    }

    byDay.set(r.day, d);
  }

  return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
}
