import { and, eq, gte, inArray, like, sql } from "drizzle-orm";

import { db } from "~/db";
import { episodes, whoopRecords } from "~/db/schema";
import { addDays, localDay } from "~/lib/day";
import { buildDays, type Day } from "~/lib/whoop/days";
import { hrPoints, segments, type HrPoint, type Segment } from "~/lib/whoop/intraday";
import { SOCIAL_GROUPS, type Spoken } from "~/lib/whoop/longevity";
import type { Finding } from "~/server/insights/findings";
import { loadFindings } from "~/server/queries/findings";
import { loadReading, type Reading } from "~/server/queries/reading";

/**
 * Everything the WHOOP screens draw (`/?ver=whoop`): seven months of mornings,
 * so 6M trends and Healthspan's 6-month marks have their 30 days before; the
 * strap's minutes for the last week; and what moves his recovery.
 */
export interface WhoopData {
  today: string;
  days: Day[];
  maxHr: number | null;
  /** Calendar age, for WHOOP Age. Null until he gives his birth date. */
  age: number | null;
  /** Edge's last week, flat: a night crosses midnight, so its rows are split across two days. */
  intraday: { hr: HrPoint[]; hypnogram: Segment[] };
  habits: { good: Finding[]; bad: Finding[] };
  /** Minutes the Pocket heard him talking, per day and who with: Longevidad's «tiempo con los tuyos». */
  spoken: Spoken[];
  /** The interpreter's last weekly reading of everything. */
  reading: Reading | null;
}

/** Javier's birth date, `YYYY-MM-DD`. Null until he says it. */
const BIRTH: string | null = null;

const DAYS_BACK = 220;
const INTRADAY_DAYS = 8;
const SPOKEN_DAYS = 63;

export async function loadWhoop(now = new Date()): Promise<WhoopData> {
  const today = localDay(now);
  const since = new Date(`${addDays(today, -DAYS_BACK)}T00:00:00Z`);
  const [rows, body, metrics, findings, spoken, reading] = await Promise.all([
    db
      .select({
        kind: whoopRecords.kind,
        externalId: whoopRecords.externalId,
        startAt: whoopRecords.startAt,
        endAt: whoopRecords.endAt,
        score: whoopRecords.score,
        label: whoopRecords.label,
        raw: whoopRecords.raw,
      })
      .from(whoopRecords)
      .where(and(inArray(whoopRecords.kind, ["sleep", "recovery", "cycle", "workout"]), gte(whoopRecords.startAt, since))),
    db.select({ raw: whoopRecords.raw }).from(whoopRecords).where(eq(whoopRecords.kind, "body")).limit(1),
    db
      .select({ externalId: whoopRecords.externalId, raw: whoopRecords.raw })
      .from(whoopRecords)
      .where(and(eq(whoopRecords.kind, "metric"), gte(whoopRecords.day, addDays(today, -INTRADAY_DAYS)), like(whoopRecords.externalId, "edge-%"))),
    loadFindings(),
    db
      .select({ day: sql<string>`${episodes.day}`, counterpart: sql<string>`${episodes.counterpart}`, minutes: sql<number>`coalesce(sum(${episodes.durationSeconds}), 0)::float8 / 60` })
      .from(episodes)
      .where(
        and(
          eq(episodes.isCurrent, true),
          gte(episodes.day, addDays(today, -SPOKEN_DAYS)),
          inArray(episodes.counterpart, SOCIAL_GROUPS.flatMap((g) => [...g.counterparts])),
        ),
      )
      .groupBy(episodes.day, episodes.counterpart),
    loadReading(),
  ]);

  const data = (name: string) => metrics.filter((m) => m.externalId.startsWith(`edge-${name}-`)).flatMap((m) => ((m.raw as { data?: unknown[] }).data ?? []) as unknown[]);
  const intraday = { hr: hrPoints(data("heart_rate")), hypnogram: segments(data("hypnogram")) };

  const maxHr = (body[0]?.raw as { max_heart_rate?: number } | undefined)?.max_heart_rate ?? null;
  const age = BIRTH ? (now.getTime() - new Date(`${BIRTH}T00:00:00Z`).getTime()) / (365.25 * 86_400_000) : null;
  return {
    today,
    days: buildDays(rows),
    maxHr,
    age,
    intraday,
    habits: { good: findings.by.recovery.good, bad: findings.by.recovery.bad },
    spoken,
    reading,
  };
}
