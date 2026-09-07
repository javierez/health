import { db } from "~/db";
import { whoopRecords, type WhoopKind } from "~/db/schema";
import { localDay } from "~/lib/day";
import { collect } from "./client";

/**
 * Pulls the four WHOOP collections and mirrors them raw.
 *
 * Deliberately dumb: WHOOP's scores are already derived from signals we never
 * see, so there is nothing to recompute. The only opinion here is which single
 * number each kind contributes to `score`, so the board can plot a day without
 * reaching into jsonb.
 */
interface WhoopScored {
  score_state?: string;
  score?: Record<string, number> | null;
}

interface WhoopCycle extends WhoopScored {
  id: number;
  start: string;
  end: string | null;
}
interface WhoopSleep extends WhoopScored {
  id: string;
  start: string;
  end: string;
}
interface WhoopRecovery extends WhoopScored {
  cycle_id: number;
  created_at: string;
}
interface WhoopWorkout extends WhoopScored {
  id: string;
  start: string;
  end: string;
  sport_name?: string | null;
}

export interface WhoopSyncReport {
  fetched: Record<WhoopKind, number>;
  errors: string[];
}

interface Row {
  id: string;
  kind: WhoopKind;
  externalId: string;
  startAt: Date | null;
  endAt: Date | null;
  day: string | null;
  score: number | null;
  label: string | null;
  durationSeconds: number | null;
  raw: unknown;
  fetchedAt: Date;
}

function row(
  kind: WhoopKind,
  externalId: string,
  start: string | null,
  end: string | null,
  score: number | null,
  label: string | null,
  raw: unknown,
): Row {
  const startAt = start ? new Date(start) : null;
  const endAt = end ? new Date(end) : null;
  return {
    id: `${kind}:${externalId}`,
    kind,
    externalId,
    startAt,
    endAt,
    day: startAt ? localDay(startAt) : null,
    score,
    label,
    durationSeconds:
      startAt && endAt ? Math.round((endAt.getTime() - startAt.getTime()) / 1000) : null,
    raw,
    fetchedAt: new Date(),
  };
}

/**
 * `start` is inclusive and ISO-8601 with a zone. Left open-ended so the first
 * run takes the whole history and later runs pass the last day already stored.
 */
export async function syncWhoop(opts: { since?: string } = {}): Promise<WhoopSyncReport> {
  const params: Record<string, string> = opts.since
    ? { start: new Date(opts.since).toISOString() }
    : {};
  const fetched: Record<WhoopKind, number> = { cycle: 0, sleep: 0, recovery: 0, workout: 0 };
  const errors: string[] = [];
  const rows: Row[] = [];

  const cycles = await collect<WhoopCycle>("/v2/cycle", params);
  if (cycles.ok) {
    fetched.cycle = cycles.data.length;
    for (const c of cycles.data) {
      rows.push(row("cycle", String(c.id), c.start, c.end, c.score?.strain ?? null, c.score_state ?? null, c));
    }
  } else errors.push(`cycle: ${cycles.reason}`);

  const sleep = await collect<WhoopSleep>("/v2/activity/sleep", params);
  if (sleep.ok) {
    fetched.sleep = sleep.data.length;
    for (const s of sleep.data) {
      rows.push(row("sleep", s.id, s.start, s.end, s.score?.sleep_performance_percentage ?? null, s.score_state ?? null, s));
    }
  } else errors.push(`sleep: ${sleep.reason}`);

  const recovery = await collect<WhoopRecovery>("/v2/recovery", params);
  if (recovery.ok) {
    fetched.recovery = recovery.data.length;
    for (const r of recovery.data) {
      rows.push(row("recovery", String(r.cycle_id), r.created_at, null, r.score?.recovery_score ?? null, r.score_state ?? null, r));
    }
  } else errors.push(`recovery: ${recovery.reason}`);

  const workouts = await collect<WhoopWorkout>("/v2/activity/workout", params);
  if (workouts.ok) {
    fetched.workout = workouts.data.length;
    for (const w of workouts.data) {
      rows.push(row("workout", w.id, w.start, w.end, w.score?.strain ?? null, w.sport_name ?? null, w));
    }
  } else errors.push(`workout: ${workouts.reason}`);

  // 🚨 WHOOP re-scores an activity minutes after it ends, so a row fetched
  // early holds `PENDING_SCORE` and a null score. Upsert, never insert-ignore.
  for (const r of rows) {
    await db.insert(whoopRecords).values(r).onConflictDoUpdate({ target: whoopRecords.id, set: r });
  }

  return { fetched, errors };
}
