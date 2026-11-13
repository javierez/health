import { and, asc, eq, gte, inArray, isNotNull, notIlike, sql } from "drizzle-orm";

import { db } from "~/db";
import { codeRecords, episodes, facts, whoopRecords } from "~/db/schema";
import { env } from "~/env";
import { addDays, hm, localDay } from "~/lib/day";
import { needMinutes, type SleepRaw } from "~/server/assistant/context";
import { sessionsFrom } from "~/server/commitments/standing";
import { TEAM } from "~/server/github/sync";

/**
 * How things are going, week by week: twelve 7-day windows, each card the
 * same shape (this week, the four before it, the bars). No day-by-day here on
 * purpose: one bad night is noise, four short weeks are a trend.
 *
 * 🚨 The weeks end on the last day his own sources have anything for, never
 * after today. Without it a pause in the syncs reads as three weeks of zero
 * sleep. Gonzalo's commits do not move it: they say nothing about Javier.
 */
export const WEEKS = 12;

export interface Week {
  /** The window's last day. */
  end: string;
  /** Stacked segments, bottom first. Null: nothing measured that week. */
  values: number[] | null;
  title: string;
}

export interface ProgressCard {
  key: "sleep" | "recovery" | "training" | "weight" | "code" | "calls";
  title: string;
  /** This week, already formatted, and what it is in. Null with no data at all. */
  value: string | null;
  unit: string;
  note: string;
  /** This week against the four before it. */
  delta: { up: boolean; text: string } | null;
  weeks: Week[];
  /** Where the bars start: weight lives between 70 and 80, not 0 and 80. */
  floor: number;
  /** Stacked cards only. */
  legend?: string[];
  empty: string;
}

export interface Progress {
  anchor: string;
  /** Under the bars: the first window and the last. */
  axis: [string, string];
  /** Set when the weeks stop before today. */
  until: string | null;
  cards: ProgressCard[];
}

interface Raw {
  nap?: boolean;
  score?: {
    recovery_score?: number;
    stage_summary?: { total_in_bed_time_milli?: number; total_awake_time_milli?: number };
  } | null;
}

const mean = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const comma = (n: number, d = 1) => n.toFixed(d).replace(".", ",");
/** 1.240, not 1240: es-ES only groups from five digits. */
const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const short = (day: string) =>
  new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

/** The window each day falls in, 0 (oldest) to WEEKS - 1 (this week), or null. */
export function weekIndex(day: string, anchor: string): number | null {
  const back = Math.round((Date.parse(`${anchor}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86_400_000);
  if (back < 0 || back >= WEEKS * 7) return null;
  return WEEKS - 1 - Math.floor(back / 7);
}

/** This week against the mean of the four before it. Under 1 % is no change. */
export function delta(weeks: (number | null)[]): { up: boolean; text: string } | null {
  const cur = weeks.at(-1);
  const before = mean(weeks.slice(-5, -1).filter((v): v is number => v !== null));
  if (cur == null || before === null || before === 0) return null;
  const pct = ((cur - before) / before) * 100;
  if (Math.abs(pct) < 1) return { up: true, text: "= igual" };
  return { up: pct > 0, text: `${pct > 0 ? "▲" : "▼"} ${Math.round(Math.abs(pct))} %` };
}

const buckets = <T>() => Array.from({ length: WEEKS }, () => [] as T[]);

interface CallEpisode {
  recordingId: string;
  call: number | null;
  category: string;
  day: string | null;
  seconds: number | null;
}

/**
 * One per (recording, call), however many episodes it spans: a recording often
 * holds several calls, and a call spans several episodes when the subject
 * changes. Work when any stretch of it is business; the tailor is not work.
 */
export function workCalls(rows: CallEpisode[]): { day: string; seconds: number }[] {
  const byCall = new Map<string, { day: string; seconds: number; work: boolean }>();
  for (const r of rows) {
    if (r.call === null || !r.day) continue;
    const key = `${r.recordingId}:${r.call}`;
    const c = byCall.get(key) ?? { day: r.day, seconds: 0, work: false };
    if (r.day < c.day) c.day = r.day;
    c.seconds += r.seconds ?? 0;
    if (r.category === "business") c.work = true;
    byCall.set(key, c);
  }
  return [...byCall.values()].filter((c) => c.work).map(({ day, seconds }) => ({ day, seconds }));
}

export async function loadProgress(now = new Date()): Promise<Progress> {
  const today = localDay(now);
  const from = new Date(now.getTime() - (WEEKS * 7 + 120) * 86_400_000);
  const me = env.GITHUB_LOGIN ?? "javierez";

  const [whoop, told, weights, code, calls, [pocket]] = await Promise.all([
    db
      .select()
      .from(whoopRecords)
      .where(and(inArray(whoopRecords.kind, ["sleep", "recovery", "workout"]), gte(whoopRecords.startAt, from)))
      .orderBy(asc(whoopRecords.startAt)),
    db
      .select({ at: facts.at, summary: facts.summary, data: facts.data })
      .from(facts)
      .where(and(eq(facts.kind, "training"), gte(facts.at, from))),
    db
      .select({ day: facts.day, at: facts.at, data: facts.data })
      .from(facts)
      .where(and(eq(facts.kind, "body"), gte(facts.at, from)))
      .orderBy(asc(facts.at)),
    db
      .select({ day: codeRecords.day, author: codeRecords.author, additions: codeRecords.additions })
      .from(codeRecords)
      // A repo's first commit is an import, not a day's writing: each
      // "Initial commit - Generated Flexweb site" was 35–50k lines on its own.
      .where(
        and(
          eq(codeRecords.kind, "commit"),
          gte(codeRecords.at, from),
          isNotNull(codeRecords.day),
          notIlike(codeRecords.title, "Initial commit%"),
        ),
      ),
    db
      .select({
        day: episodes.day,
        recordingId: episodes.recordingId,
        call: episodes.call,
        category: episodes.category,
        seconds: episodes.durationSeconds,
      })
      .from(episodes)
      .where(and(isNotNull(episodes.call), eq(episodes.isCurrent, true), isNotNull(episodes.day))),
    db.select({ first: sql<string | null>`min(${episodes.day})` }).from(episodes),
  ]);

  const nights = whoop.filter((w) => w.kind === "sleep" && w.endAt && !(w.raw as Raw).nap);
  const recoveries = whoop.filter((w) => w.kind === "recovery" && w.day);
  // The band's workouts and the ones he told: Edge detects none.
  const workouts = sessionsFrom(whoop.filter((w) => w.kind === "workout"), told);

  const latest = [
    nights.at(-1)?.endAt ? localDay(nights.at(-1)!.endAt!) : null,
    recoveries.at(-1)?.day,
    ...code.filter((c) => c.author === me).map((c) => c.day),
    ...calls.map((c) => c.day),
    weights.at(-1)?.day,
  ]
    .filter((d): d is string => Boolean(d) && d! <= today)
    .sort()
    .at(-1);
  const anchor = latest ?? today;
  const ends = Array.from({ length: WEEKS }, (_, i) => addDays(anchor, -7 * (WEEKS - 1 - i)));
  const label = (i: number) => (i === WEEKS - 1 ? "Esta semana" : `Semana al ${short(ends[i]!)}`);

  // — sleep: the mean night of each week, and what it needed —
  const slept = buckets<number>();
  const needed = buckets<number>();
  for (const n of nights) {
    const i = weekIndex(localDay(n.endAt!), anchor);
    const b = (n.raw as Raw).score?.stage_summary;
    if (i === null || !b?.total_in_bed_time_milli) continue;
    slept[i]!.push((b.total_in_bed_time_milli - (b.total_awake_time_milli ?? 0)) / 60_000);
    const need = needMinutes(n.raw as SleepRaw);
    if (need !== null) needed[i]!.push(need);
  }
  const sleepWeeks = slept.map(mean);
  const needNow = mean(needed.slice(-4).flat());

  const rec = buckets<number>();
  for (const r of recoveries) {
    const i = weekIndex(r.day!, anchor);
    const s = (r.raw as Raw).score?.recovery_score;
    if (i !== null && s != null) rec[i]!.push(s);
  }
  const recWeeks = rec.map(mean);

  const sessions = buckets<number | null>();
  for (const w of workouts) {
    const i = weekIndex(localDay(w.at), anchor);
    if (i !== null) sessions[i]!.push(w.minutes);
  }
  const anyTraining = workouts.length > 0;
  const sessionWeeks = sessions.map((s) => (anyTraining ? s.length : null));

  // Weight: the last reading of each week.
  const kg = buckets<number>();
  for (const w of weights) {
    const i = weekIndex(w.day, anchor);
    if (i !== null && w.data.weightKg) kg[i]!.push(w.data.weightKg);
  }
  const kgWeeks = kg.map((k) => k.at(-1) ?? null);
  const kgKnown = kgWeeks.filter((v): v is number => v !== null);

  // Lines written a day, his and Gonzalo's, stacked.
  const authors = [me, ...TEAM];
  const lines = authors.map(() => Array.from({ length: WEEKS }, () => 0));
  for (const c of code) {
    const i = weekIndex(c.day!, anchor);
    const a = authors.indexOf(c.author ?? me);
    if (i !== null && a >= 0) lines[a]![i]! += (c.additions ?? 0) / 7;
  }
  const codeTotal = lines[0]!.map((_, i) => lines.reduce((s, l) => s + l[i]!, 0));

  const callRows = buckets<{ day: string; seconds: number }>();
  for (const c of workCalls(calls)) {
    const i = weekIndex(c.day, anchor);
    if (i !== null) callRows[i]!.push(c);
  }
  // Before the Pocket's first day a week is unknown, not zero calls: without
  // this the first weeks with the Pocket read as "▲ 225 %".
  const firstHeard = pocket?.first ?? null;
  const callWeeks = callRows.map((r, i) => (firstHeard && ends[i]! >= firstHeard ? r.length : null));
  const anyCalls = firstHeard !== null;
  const callMinutes = callRows.at(-1)!.reduce((a, r) => a + r.seconds / 60, 0);

  const prior = (xs: (number | null)[]) => mean(xs.slice(-5, -1).filter((v): v is number => v !== null));
  const single = (xs: (number | null)[], fmt: (v: number) => string): Week[] =>
    xs.map((v, i) => ({ end: ends[i]!, values: v === null ? null : [v], title: `${label(i)}: ${v === null ? "sin datos" : fmt(v)}` }));

  const cur = <T>(xs: T[]) => xs.at(-1) ?? null;
  const sessionsNow = cur(sessions) ?? [];
  const codeNow = lines.map((l) => l.at(-1) ?? 0);

  const cards: ProgressCard[] = [
    {
      key: "sleep",
      title: "Sueño",
      value: cur(sleepWeeks) === null ? null : hm(cur(sleepWeeks)!),
      unit: "por noche",
      note: [needNow === null ? null : `Necesitas ${hm(needNow)}`, prior(sleepWeeks) === null ? null : `antes ${hm(prior(sleepWeeks)!)}`]
        .filter(Boolean)
        .join(" · "),
      delta: delta(sleepWeeks),
      weeks: single(sleepWeeks, (v) => hm(v)),
      floor: 0,
      empty: "Sin noches de WHOOP.",
    },
    {
      key: "recovery",
      title: "Recuperación",
      value: cur(recWeeks) === null ? null : `${Math.round(cur(recWeeks)!)} %`,
      unit: "de media",
      note: prior(recWeeks) === null ? "" : `Antes ${Math.round(prior(recWeeks)!)} %`,
      delta: delta(recWeeks),
      weeks: single(recWeeks, (v) => `${Math.round(v)} %`),
      floor: 0,
      empty: "Sin recuperación de WHOOP.",
    },
    {
      key: "training",
      title: "Entreno",
      value: anyTraining ? String(sessionsNow.length) : null,
      unit: sessionsNow.length === 1 ? "sesión" : "sesiones",
      note: [
        // A told one has no minutes: a total without it would be short.
        sessionsNow.length === 0 ? "Ninguno apuntado" : sessionsNow.every((m) => m !== null) ? `${hm(sessionsNow.reduce<number>((a, b) => a + b!, 0))} en total` : null,
        prior(sessionWeeks) === null ? null : `antes ${comma(prior(sessionWeeks)!)} por semana`,
      ]
        .filter(Boolean)
        .join(" · "),
      delta: delta(sessionWeeks),
      weeks: single(sessionWeeks, (v) => `${v} ${v === 1 ? "sesión" : "sesiones"}`),
      floor: 0,
      empty: "Sin entrenos.",
    },
    {
      key: "weight",
      title: "Peso",
      value: kgKnown.length > 0 ? comma(kgKnown.at(-1)!) : null,
      unit: "kg",
      note:
        kgKnown.length > 1 ? `${kgKnown.at(-1)! >= kgKnown[0]! ? "+" : "−"}${comma(Math.abs(kgKnown.at(-1)! - kgKnown[0]!))} kg en ${WEEKS} semanas` : "La última báscula",
      delta: delta(kgWeeks),
      weeks: single(kgWeeks, (v) => `${comma(v)} kg`),
      floor: kgKnown.length > 0 ? Math.floor(Math.min(...kgKnown)) - 1 : 0,
      empty: "Dile al chat cuánto pesas.",
    },
    {
      key: "code",
      title: "Código",
      value: code.length > 0 ? thousands(codeTotal.at(-1)!) : null,
      unit: "líneas al día",
      note: authors.length > 1 ? `Tú ${thousands(codeNow[0]!)} · Gonzalo ${thousands(codeNow[1] ?? 0)}` : "Líneas escritas",
      delta: delta(codeTotal),
      weeks: codeTotal.map((t, i) => ({
        end: ends[i]!,
        values: lines.map((l) => l[i]!),
        title: `${label(i)}: ${thousands(t)} al día (tú ${thousands(lines[0]![i]!)}, Gonzalo ${thousands(lines[1]?.[i] ?? 0)})`,
      })),
      floor: 0,
      legend: ["Tú", "Gonzalo"],
      empty: "Sin commits de GitHub.",
    },
    {
      key: "calls",
      title: "Llamadas",
      value: anyCalls ? String(cur(callWeeks)) : null,
      unit: "de trabajo",
      note: [
        callMinutes > 0 ? `${hm(callMinutes)} al teléfono` : null,
        prior(callWeeks) === null ? null : `antes ${comma(prior(callWeeks)!)} por semana`,
      ]
        .filter(Boolean)
        .join(" · "),
      delta: delta(callWeeks),
      weeks: single(callWeeks, (v) => `${v} ${v === 1 ? "llamada" : "llamadas"}`),
      floor: 0,
      empty: "Ninguna llamada oída por el Pocket.",
    },
  ];

  return {
    anchor,
    axis: [short(addDays(ends[0]!, -6)), anchor === today ? "Hoy" : short(anchor)],
    until: anchor < addDays(today, -1) ? short(anchor) : null,
    cards,
  };
}

/** The same numbers as lines, for the assistant's context. */
/** `without`: cards with no week behind them, e.g. sleep and recovery while the band is silent. */
export function progressLines(p: Progress, without: ProgressCard["key"][] = []): string[] {
  return p.cards.filter((c) => !without.includes(c.key)).map(
    (c) =>
      `- ${c.title}: ${c.value === null ? "sin datos" : `${c.value} ${c.unit}`} esta semana${c.note ? ` (${c.note})` : ""}${c.delta ? `, ${c.delta.text} frente a las 4 semanas antes` : ""}`,
  );
}
