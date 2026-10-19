import { desc, eq, gte, isNotNull, sql } from "drizzle-orm";

import { db } from "~/db";
import { waDays, waMessages, whoopRecords } from "~/db/schema";
import { addDays, localDay } from "~/lib/day";
import { MOOD_LABEL, moodPattern, topicTension, type Morning, type MoodPattern, type TopicRow } from "~/lib/wa-pattern";
import type { Row } from "./salud";

const conversations = (n: number) => `${n} ${n === 1 ? "conversación" : "conversaciones"}`;

/**
 * His WhatsApp on a day card, one line and nothing to open: how the day may
 * have left him, once it is read (after midnight), and how many conversations.
 */
export async function whatsappDays(since: string): Promise<Map<string, { summary: string; rows: Row[] }>> {
  const [counts, read] = await Promise.all([
    db
      .select({ day: waMessages.day, chats: sql<number>`count(distinct ${waMessages.chat})::int` })
      .from(waMessages)
      .where(gte(waMessages.day, since))
      .groupBy(waMessages.day),
    db.select({ day: waDays.day, mood: waDays.mood }).from(waDays).where(gte(waDays.day, since)),
  ]);
  const mood = new Map(read.flatMap((d) => (d.mood === null ? [] : [[d.day, MOOD_LABEL[d.mood]] as const])));
  return new Map(
    counts.map((c) => {
      const label = mood.get(c.day);
      return [c.day, { summary: label ? `${label} · ${conversations(c.chats)}` : conversations(c.chats), rows: [] }];
    }),
  );
}

interface RecoveryRaw {
  score?: { recovery_score?: number; hrv_rmssd_milli?: number } | null;
}

export type WaPattern = MoodPattern & { topics: TopicRow[] };

/**
 * Every read day against the morning after (WHOOP's latest recovery of a day
 * is its morning one), and which topics came with tension in 12 weeks.
 */
export async function whatsappPattern(): Promise<WaPattern> {
  const [days, recoveries, recent] = await Promise.all([
    db.select({ day: waDays.day, mood: waDays.mood }).from(waDays).where(isNotNull(waDays.mood)),
    db
      .select({ day: whoopRecords.day, raw: whoopRecords.raw })
      .from(whoopRecords)
      .where(eq(whoopRecords.kind, "recovery"))
      .orderBy(desc(whoopRecords.startAt)),
    db.select({ chats: waDays.chats }).from(waDays).where(gte(waDays.day, addDays(localDay(new Date()), -84))),
  ]);
  const mornings = new Map<string, Morning>();
  for (const r of recoveries) {
    const score = (r.raw as RecoveryRaw).score;
    if (!r.day || mornings.has(r.day) || score?.recovery_score === undefined) continue;
    mornings.set(r.day, {
      recovery: score.recovery_score,
      hrv: score.hrv_rmssd_milli ? Math.round(score.hrv_rmssd_milli) : null,
    });
  }
  return {
    ...moodPattern(
      days.map((d) => ({ day: d.day, mood: d.mood! })),
      mornings,
    ),
    topics: topicTension(recent),
  };
}
