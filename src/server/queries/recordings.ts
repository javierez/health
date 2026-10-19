import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "~/db";
import { type Category, episodes, recordings } from "~/db/schema";

export interface Activity {
  id: number;
  day: string;
  category: Category;
  /** Controlled vocabulary — `~/lib/taxonomy`. Null when the model went off-list. */
  kind: string | null;
  counterpart: string | null;
  subcategory: string | null;
  oneLiner: string | null;
  /** Wall-clock start: the recording's own start plus the episode's offset. */
  startsAt: Date;
  endsAt: Date;
  durationSeconds: number;
  people: string[];
  topics: string[];
  recordingId: string;
  recordingTitle: string | null;
  /** How many consecutive episodes were folded into this one. 1 = untouched. */
  parts: number;
}

/**
 * 🚨 The list the app is actually about.
 *
 * A recording is a container, not a thing that happened — one file is a client
 * call, then the school run, then someone telling a story. What we count are
 * ACTIVITIES: each episode placed on the real clock, so two recordings that
 * overlap lunchtime interleave the way the day actually went.
 *
 * `noise` never reaches here: it is stored with zero seconds by design, so it
 * would draw a zero-height nothing on every timeline it touched.
 */
export async function listActivities(opts: { limit?: number } = {}): Promise<Activity[]> {
  const rows = await db
    .select({
      id: episodes.id,
      day: episodes.day,
      category: episodes.category,
      kind: episodes.kind,
      counterpart: episodes.counterpart,
      subcategory: episodes.subcategory,
      oneLiner: episodes.oneLiner,
      startSeconds: episodes.startSeconds,
      durationSeconds: episodes.durationSeconds,
      people: episodes.people,
      topics: episodes.topics,
      recordingId: episodes.recordingId,
      recordingTitle: recordings.title,
      recordedAt: recordings.recordedAt,
    })
    .from(episodes)
    .innerJoin(recordings, eq(episodes.recordingId, recordings.id))
    .where(
      and(
        eq(episodes.isCurrent, true),
        sql`${episodes.category} <> 'noise'`,
        sql`${episodes.day} is not null`,
        sql`${recordings.recordedAt} is not null`,
      ),
    )
    .orderBy(desc(recordings.recordedAt), asc(episodes.seq))
    .limit(opts.limit ?? 5000);

  const activities: Activity[] = rows.flatMap((r) => {
    if (!r.day || !r.recordedAt) return [];
    const startsAt = new Date(r.recordedAt.getTime() + (r.startSeconds ?? 0) * 1000);
    const seconds = r.durationSeconds ?? 0;
    return [
      {
        id: r.id,
        day: r.day,
        category: r.category,
        kind: r.kind,
        counterpart: r.counterpart,
        subcategory: r.subcategory,
        oneLiner: r.oneLiner,
        startsAt,
        endsAt: new Date(startsAt.getTime() + seconds * 1000),
        durationSeconds: seconds,
        people: r.people ?? [],
        topics: r.topics ?? [],
        recordingId: r.recordingId,
        recordingTitle: r.recordingTitle,
        parts: 1,
      },
    ];
  });

  return mergeRuns(activities);
}

/** A pause longer than this ends a run, even if the classification matches. */
const MERGE_GAP_SECONDS = 180;

/**
 * 🚨 Folds a run of consecutive, identically-classified episodes into one
 * activity.
 *
 * This is a counting fix, not a cosmetic one. Classification runs on 45-minute
 * windows, so a 90-minute client call arrives as three `business/client-call`
 * episodes — and "how many business calls this week" then answers three. Every
 * screen reads from here, so the day, the week and the month cannot disagree
 * about it.
 *
 * Only touches episodes from the SAME recording that share category, kind and
 * counterpart and are less than three minutes apart: two calls back to back
 * with different people stay two calls.
 */
function mergeRuns(activities: Activity[]): Activity[] {
  const sorted = [...activities].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const out: Activity[] = [];

  for (const a of sorted) {
    const last = out[out.length - 1];
    const continues =
      last !== undefined &&
      last.recordingId === a.recordingId &&
      last.category === a.category &&
      last.kind === a.kind &&
      last.counterpart === a.counterpart &&
      (a.startsAt.getTime() - last.endsAt.getTime()) / 1000 <= MERGE_GAP_SECONDS;

    if (!continues) {
      out.push({ ...a });
      continue;
    }

    last.endsAt = a.endsAt > last.endsAt ? a.endsAt : last.endsAt;
    last.durationSeconds += a.durationSeconds;
    last.parts += 1;
    last.people = [...new Set([...last.people, ...a.people])];
    last.topics = [...new Set([...last.topics, ...a.topics])];
    // The longest slice is the one whose summary describes the whole run best.
    if ((a.oneLiner?.length ?? 0) > (last.oneLiner?.length ?? 0)) last.oneLiner = a.oneLiner;
  }

  return out.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
}
