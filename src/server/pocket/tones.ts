import { and, desc, eq, inArray, isNotNull, isNull, ne, notInArray, or, sql } from "drizzle-orm";

import { db } from "~/db";
import { episodes, recordings } from "~/db/schema";
import { readTones, TONES_VERSION, type Talk } from "~/server/classify/tones";

/** A stretch with someone else in it: what has a tone. A TV or a video playing is not someone. */
const isTalk = and(
  eq(episodes.isCurrent, true),
  ne(episodes.category, "noise"),
  isNotNull(episodes.counterpart),
  notInArray(episodes.counterpart, ["solo", "media"]),
);

/** Recordings with a conversation not read for tone yet, newest first. */
export async function untoned(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: recordings.id, at: recordings.recordedAt })
    .from(recordings)
    .innerJoin(episodes, and(eq(episodes.recordingId, recordings.id), isTalk))
    .where(or(isNull(recordings.tonesVersion), ne(recordings.tonesVersion, TONES_VERSION)))
    .orderBy(desc(recordings.recordedAt));
  return rows.map((r) => r.id);
}

/** Each conversation of one recording, read and written onto its episode. */
export async function readTonesStored(recordingId: string): Promise<{ ok: true; tones: number } | { ok: false; detail: string }> {
  const [row] = await db.select({ turns: recordings.turns }).from(recordings).where(eq(recordings.id, recordingId));
  if (!row) return { ok: false, detail: "recording not stored" };
  const talks = await db
    .select({ id: episodes.id, seq: episodes.seq, counterpart: episodes.counterpart, start: episodes.startSeconds, end: episodes.endSeconds })
    .from(episodes)
    .where(and(eq(episodes.recordingId, recordingId), isTalk))
    .orderBy(episodes.seq);

  const turns = row.turns ?? [];
  const asked: Talk[] = talks.map((t) => ({
    n: t.seq,
    with: t.counterpart,
    turns: turns.filter((x) => (x.startSeconds ?? 0) >= (t.start ?? 0) && (x.startSeconds ?? 0) < (t.end ?? Number.POSITIVE_INFINITY)),
  }));
  const res = await readTones(asked);
  if (!res.ok) return res;

  await db.transaction(async (tx) => {
    for (const t of res.tones) {
      const id = talks.find((x) => x.seq === t.n)?.id;
      if (id) await tx.update(episodes).set({ tone: t.tone, theme: t.theme, effect: t.effect }).where(eq(episodes.id, id));
    }
    await tx.update(recordings).set({ tonesVersion: TONES_VERSION }).where(eq(recordings.id, recordingId));
  });
  return { ok: true, tones: res.tones.length };
}

/** For the dry run: how much there is to read, in characters. */
export async function untonedChars(): Promise<{ recordings: number; talks: number; chars: number }> {
  const ids = await untoned();
  if (ids.length === 0) return { recordings: 0, talks: 0, chars: 0 };
  const [r] = await db
    .select({
      talks: sql<number>`count(*)::int`,
      // A conversation's share of its recording's text, by time; capped like the prompt.
      chars: sql<number>`coalesce(sum(least(12000, length(${recordings.transcript}) * greatest(0, coalesce(${episodes.endSeconds} - ${episodes.startSeconds}, 0)) / greatest(1, ${recordings.durationSeconds}))), 0)::int`,
    })
    .from(episodes)
    .innerJoin(recordings, eq(recordings.id, episodes.recordingId))
    .where(and(isTalk, inArray(recordings.id, ids)));
  return { recordings: ids.length, talks: r?.talks ?? 0, chars: r?.chars ?? 0 };
}
