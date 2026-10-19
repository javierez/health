import { and, eq, gte, inArray, isNotNull, ne, notInArray, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "~/db";
import { checks, commitments, episodes, facts, kinds, productUses, products, waDays, whoopRecords, type FactData } from "~/db/schema";
import { env } from "~/env";
import { addDays, localDay } from "~/lib/day";
import { ROUTINES } from "~/lib/routines";
import { isMood, moodOf, symptomsOf } from "~/lib/trackers";
import { buildDays, type Day, type Raw } from "~/server/insights/days";
import { findings, type Findings } from "~/server/insights/findings";
import { loadHypotheses } from "~/server/queries/hypotheses";

/** A year of days is enough to see a pattern and still be him now. */
const DAYS = 365;

interface SleepRaw {
  nap?: boolean;
  score?: { stage_summary?: { total_in_bed_time_milli?: number; total_awake_time_milli?: number } } | null;
}
interface RecoveryRaw {
  score?: { recovery_score?: number; hrv_rmssd_milli?: number; resting_heart_rate?: number } | null;
}

const range = (r: { first: string | null; last: string | null } | undefined): [string, string] | null =>
  r?.first && r.last ? [r.first, r.last] : null;

/** Every source, a row per day, once per request: WHOOP, his code, his WhatsApp and its AI read, Pocket, the chat. */
export const loadDays = cache(async (now = new Date()): Promise<Day[]> => {
  const since = addDays(localDay(now), -DAYS);
  const author = env.GITHUB_LOGIN ?? "javierez";
  const [whoop, code, lateCode, codeRange, whatsapp, waRange, reads, pocket, pocketRange, heard, meals, uses, done, told] = await Promise.all([
    db
      .select({ kind: whoopRecords.kind, day: whoopRecords.day, start: whoopRecords.startAt, end: whoopRecords.endAt, raw: whoopRecords.raw })
      .from(whoopRecords)
      .where(and(inArray(whoopRecords.kind, ["recovery", "sleep", "workout", "cycle"]), gte(whoopRecords.day, since))),
    db.execute<{ day: string; lines: number }>(sql`
      select (at at time zone 'Europe/Madrid')::date::text as day, sum(coalesce(additions, 0) + coalesce(deletions, 0))::int as lines
      from code_records where kind = 'commit' and author = ${author} and day >= ${since} group by 1`),
    db.execute<{ day: string }>(sql`
      select distinct ((at at time zone 'Europe/Madrid')::date - 1)::text as day
      from code_records where kind = 'commit' and author = ${author} and day >= ${since}
        and extract(hour from at at time zone 'Europe/Madrid') < 6`),
    db.execute<{ first: string | null; last: string | null }>(sql`select min(day) as first, max(day) as last from code_records`),
    // His day runs 04:00 to 04:00: a message at 01:00 belongs to the evening before.
    db.execute<{ day: string; sent: number; late: number; chats: number; last: string }>(sql`
      select ((at at time zone 'Europe/Madrid') - interval '4 hours')::date::text as day, count(*)::int as sent,
        count(*) filter (where extract(hour from at at time zone 'Europe/Madrid') >= 23
                            or extract(hour from at at time zone 'Europe/Madrid') < 4)::int as late,
        count(distinct chat)::int as chats, max(at)::text as last
      from wa_messages where from_me and day >= ${since} group by 1`),
    // Evolution kept only his last months: before them, a handful of messages a month. History starts
    // on the first day with 20, or a winter without the import reads as «no WhatsApp at night».
    db.execute<{ first: string | null; last: string | null }>(sql`
      select (select min(day) from (select day from wa_messages group by day having count(*) >= 20) d) as first,
        max(day) as last from wa_messages`),
    db.select({ day: waDays.day, mood: waDays.mood, summary: waDays.summary, chats: waDays.chats }).from(waDays).where(gte(waDays.day, since)),
    db.execute<{ day: string; business: number; social: number; lines: string }>(sql`
      select day, coalesce(sum(duration_seconds) filter (where category = 'business' and counterpart <> 'solo'), 0)::int / 60 as business,
        coalesce(sum(duration_seconds) filter (where category = 'social'), 0)::int / 60 as social,
        string_agg(one_liner, ' · ' order by id) as lines
      from episodes where is_current and day >= ${since} group by day`),
    db.execute<{ first: string | null; last: string | null }>(sql`select min(day) as first, max(day) as last from episodes where is_current`),
    // What the Pocket heard, read for tone: counted with his WhatsApp chats.
    db
      .select({ day: episodes.day, tone: episodes.tone, topic: episodes.theme })
      .from(episodes)
      .where(and(eq(episodes.isCurrent, true), isNotNull(episodes.tone), gte(episodes.day, since))),
    db.select({ day: facts.day, at: facts.at, data: facts.data }).from(facts).where(and(eq(facts.kind, "meal"), gte(facts.day, since))),
    db
      .select({ day: productUses.day, name: products.name })
      .from(productUses)
      .innerJoin(products, eq(products.id, productUses.productId))
      .where(and(ne(products.area, "piel"), gte(productUses.day, since))),
    // His habits ticked off: the ones counted by themselves (gym, runs, bed) are compared already,
    // and a routine is its products: its supplements are compared above, its creams never.
    db
      .select({ day: checks.day, name: commitments.title })
      .from(checks)
      .innerJoin(commitments, eq(commitments.id, checks.commitmentId))
      .where(and(sql`cardinality(${commitments.activities}) = 0`, notInArray(commitments.title, ROUTINES), gte(checks.day, since))),
    // Trainings told in the chat or heard by Pocket, anything of his own («Meditar», «Sauna»), his mood and symptoms.
    db
      .select({ day: facts.day, kind: facts.kind, summary: facts.summary, data: facts.data, name: kinds.name })
      .from(facts)
      .leftJoin(kinds, eq(kinds.key, sql`${facts.data}->>'kind'`))
      .where(and(inArray(facts.kind, ["training", "other", "toilet"]), gte(facts.day, since))),
  ]);

  const raw: Raw = {
    sleeps: whoop.flatMap((w) => {
      const r = w.raw as SleepRaw;
      if (w.kind !== "sleep" || r.nap || !w.day || !w.start) return [];
      const s = r.score?.stage_summary;
      const slept = s?.total_in_bed_time_milli ? (s.total_in_bed_time_milli - (s.total_awake_time_milli ?? 0)) / 60_000 : null;
      return [{ morning: w.day, start: w.start, slept }];
    }),
    recoveries: whoop.flatMap((w) => {
      if (w.kind !== "recovery" || !w.day) return [];
      const s = (w.raw as RecoveryRaw).score;
      return [{ morning: w.day, recovery: s?.recovery_score ?? null, hrv: s?.hrv_rmssd_milli ?? null, rhr: s?.resting_heart_rate ?? null }];
    }),
    strain: whoop.flatMap((w) =>
      w.kind === "cycle" && w.day ? [{ day: w.day, strain: (w.raw as { score?: { strain?: number } | null }).score?.strain ?? null }] : [],
    ),
    workouts: whoop.flatMap((w) =>
      w.kind === "workout" && w.day && w.end ? [{ day: w.day, end: w.end, sport: (w.raw as { sport_name?: string }).sport_name ?? "" }] : [],
    ),
    code: code.map((c) => ({ day: c.day, lines: Number(c.lines) })),
    lateCode: lateCode.map((c) => c.day),
    codeRange: range(codeRange[0]),
    whatsapp: whatsapp.map((w) => ({ day: w.day, sent: Number(w.sent), late: Number(w.late), chats: Number(w.chats), last: new Date(w.last) })),
    whatsappRange: range(waRange[0]),
    waDays: reads,
    pocket: pocket.map((p) => ({ day: p.day, business: Number(p.business), social: Number(p.social), lines: p.lines ?? "" })),
    pocketRange: range(pocketRange[0]),
    talks: heard.flatMap((t) => (t.day && t.tone ? [{ day: t.day, tone: t.tone, topic: t.topic ?? null }] : [])),
    meals: meals.map((m) => {
      const d = m.data as FactData;
      return { day: m.day, at: m.at, meal: d.meal, alcohol: d.alcohol ?? false, caffeine: d.caffeine ?? false, foods: d.foods };
    }),
    productUses: uses,
    trainings: told.flatMap((t) => (t.kind === "training" ? [{ day: t.day, training: (t.data as FactData).training ?? "other" }] : [])),
    did: [
      ...done,
      // A headache or his mood is not something he does.
      ...told.flatMap((t) => {
        const d = t.data as FactData;
        if (t.kind === "toilet" || !d.kind || d.state || isMood(d) || symptomsOf(t.kind, d, t.summary).length > 0) return [];
        return [{ day: t.day, name: d.name ?? t.name ?? d.kind.charAt(0).toUpperCase() + d.kind.slice(1) }];
      }),
    ],
    moods: told.flatMap((t) => {
      const v = moodOf(t.data as FactData);
      return v === null ? [] : [{ day: t.day, value: v }];
    }),
    symptoms: told.flatMap((t) => symptomsOf(t.kind, t.data as FactData, t.summary).map((name) => ({ day: t.day, name }))),
  };
  // Today is not over: its evening has no morning yet.
  return buildDays(raw, localDay(now));
});

/** Once per request: the panel's card, today's advice and «Cómo te afecta» all read it. */
export const loadFindings = cache(async (): Promise<Findings> => {
  const [days, extra] = await Promise.all([loadDays(), loadHypotheses()]);
  return findings(days, extra);
});
