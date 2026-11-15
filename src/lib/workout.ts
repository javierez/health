import { localClock } from "~/lib/day";
import type { Work, Zone } from "~/lib/exercises";
import type { Session, SessionLine, SetRow } from "~/server/training/summary";

/**
 * One session as its own page reads it (Javier, 14-nov-2026: «una URL al
 * acabar… verlo y darle una puntuación», and 15-nov: «puntuarlo… it is
 * yourself who sees it»): the band's pulse while it lasted, what he moved,
 * and Pulso's score with its reasons. Pure: the rows come from
 * `queries/training.ts`.
 */
export interface PulseMinute {
  /** `HH:mm` in Madrid. */
  t: string;
  avg: number;
  max: number;
}

/** WHOOP's five zones, from a share of his max pulse: 50 %, 60 %, 70 %, 80 % and 90 %. */
const ZONE_FROM = [0.5, 0.6, 0.7, 0.8, 0.9];

export interface Zones {
  /** Where each zone starts, in beats: with 187, 94 · 112 · 131 · 150 · 168. */
  from: number[];
  /** Minutes in each, by the minute's average; below zone 1 does not count. */
  minutes: number[];
}

export function zonesOf(pulse: PulseMinute[], maxHr: number): Zones {
  const from = ZONE_FROM.map((f) => Math.round(f * maxHr));
  const minutes = from.map(() => 0);
  for (const p of pulse) {
    let z = -1;
    from.forEach((b, i) => p.avg >= b && (z = i));
    if (z >= 0) minutes[z]! += 1;
  }
  return { from, minutes };
}

export interface Score {
  /** 1 to 10. */
  score: number;
  plus: string[];
  minus: string[];
}

export interface WorkoutStats {
  minutes: number | null;
  /** From his pulse going up to it coming down («19:19» to «20:43»), when the band had it. */
  range: { from: string; to: string } | null;
  exercises: number;
  sets: number;
  /** Kilos × reps, both hands with dumbbells. */
  moved: number;
  avgHr: number | null;
  maxHr: number | null;
}

/** Before his first message he was already warming up; after the last, a few minutes more. */
const BEFORE_MIN = 15;
const AFTER_MIN = 15;
/** Above this the band says he is working, not resting between days. */
const WORKING_HR = 95;
/** «Llegaste a esfuerzo alto»: about 85 % of a 190 maximum. */
const HIGH_HR = 160;

/** Pulso's per-minute row (`edge-heart_rate-<day>`): unordered, sometimes twice the same minute. */
export function pulseOf(raw: unknown, span: Session["span"]): PulseMinute[] {
  if (!span) return [];
  const data = (raw as { data?: { Avg?: number; Max?: number; date?: string }[] } | null)?.data ?? [];
  const from = span.from.getTime() - BEFORE_MIN * 60_000;
  const to = span.to.getTime() + AFTER_MIN * 60_000;
  const byMinute = new Map<number, PulseMinute>();
  for (const p of data) {
    // «2026-11-14 19:25:00 +0100»
    const iso = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) ([+-]\d\d)(\d\d)$/.exec(p.date ?? "");
    const at = iso ? Date.parse(`${iso[1]}T${iso[2]}${iso[3]}:${iso[4]}`) : NaN;
    if (!Number.isFinite(at) || at < from || at > to || !p.Avg || !p.Max) continue;
    byMinute.set(at, { t: localClock(new Date(at)), avg: p.Avg, max: p.Max });
  }
  return [...byMinute.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}

/** Kilos moved in one exercise: with dumbbells, each hand's. */
export function movedOf(line: Pick<SessionLine, "detail" | "perHand">): number {
  const hands = line.perHand ? 2 : 1;
  return line.detail.reduce((n, s) => n + (s.kg && s.reps ? s.kg * s.reps * hands : 0), 0);
}

export function statsOf(s: Session, pulse: PulseMinute[]): WorkoutStats {
  const exercises = s.lines.filter((l) => !l.sport);
  const working = pulse.filter((p) => p.avg >= WORKING_HR);
  // The band's minutes when it had the session, else the time his pulse was up, else first to last message.
  const minutes =
    s.minutes ?? (working.length >= 2 ? spanMinutes(working[0]!.t, working.at(-1)!.t) : s.span ? Math.round((s.span.to.getTime() - s.span.from.getTime()) / 60_000) || null : null);
  return {
    minutes,
    range: s.minutes === null && working.length >= 2 ? { from: working[0]!.t, to: working.at(-1)!.t } : null,
    exercises: exercises.length,
    sets: exercises.reduce((n, l) => n + l.detail.length, 0),
    moved: Math.round(exercises.reduce((n, l) => n + movedOf(l), 0)),
    avgHr: pulse.length > 0 ? Math.round(pulse.reduce((n, p) => n + p.avg, 0) / pulse.length) : null,
    maxHr: pulse.length > 0 ? Math.max(...pulse.map((p) => p.max)) : null,
  };
}

const spanMinutes = (a: string, b: string) => {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return m(b) - m(a) + 1;
};

const kg = (n: number) => `${Number(n.toFixed(1)).toLocaleString("es-ES")} kg`;
const lower = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);
const list = (names: string[]) => (names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`);

/**
 * Pulso's score, from what he told and the band: 5 to start, a point for each
 * thing done well and one off for each left short. Every point says why.
 */
export function scoreOf(s: Session, stats: WorkoutStats): Score {
  const plus: string[] = [];
  const minus: string[] = [];
  const exercises = s.lines.filter((l) => !l.sport);

  if (stats.sets >= 12) plus.push(`${stats.sets} series${stats.moved > 0 ? `, ${tons(stats.moved)} movidas` : ""}`);
  if (stats.minutes && stats.minutes >= 45) plus.push(`${stats.minutes} min entrenando`);
  const up = exercises.find((l) => climbed(l.detail));
  if (up) {
    const kgs = up.detail.flatMap((d) => (d.kg ? [d.kg] : []));
    plus.push(`Subiste ${lower(up.name)} de ${kg(kgs[0]!)} a ${kg(Math.max(...kgs))}`);
  }
  if (stats.maxHr && stats.maxHr >= HIGH_HR) plus.push(`Pulso máx ${stats.maxHr}: llegaste a esfuerzo alto`);

  const single = exercises.filter((l) => l.detail.length === 1);
  if (single.length >= 2) minus.push(`${list(single.map((l) => l.name))}: una serie cada uno`);
  const dropped = exercises.find((l) => fell(l.detail));
  if (dropped) {
    const reps = dropped.detail.map((d) => d.reps ?? 0);
    minus.push(`La última serie de ${lower(dropped.name)} se quedó en ${reps.at(-1)} de ${reps[0]}`);
  }
  if (exercises.length === 0 && stats.minutes && stats.minutes < 20) minus.push(`Solo ${stats.minutes} min`);

  return { score: Math.max(1, Math.min(10, 5 + plus.length - minus.length)), plus, minus };
}

const tons = (moved: number) => (moved >= 1000 ? `${(moved / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} t` : kg(moved));

/** He put on weight within the session: 55, 55, 65. */
function climbed(sets: SetRow[]): boolean {
  const kgs = sets.flatMap((s) => (s.kg ? [s.kg] : []));
  return kgs.length >= 2 && Math.max(...kgs) > kgs[0]!;
}

/** Same weight, fewer reps on the last set: 10, 10, 7. */
function fell(sets: SetRow[]): boolean {
  if (sets.length < 2) return false;
  const first = sets[0]!;
  const last = sets.at(-1)!;
  return first.reps != null && last.reps != null && last.reps < first.reps && last.kg === first.kg;
}

/** The WhatsApp when he is done: what he did in one line, the score and the link. */
export function doneText(stats: WorkoutStats, score: Score, url: string): string {
  const what = [
    stats.minutes ? `${stats.minutes} min` : null,
    stats.exercises > 0 ? `${stats.exercises} ${stats.exercises === 1 ? "ejercicio" : "ejercicios"}` : null,
    stats.maxHr ? `pulso máx ${stats.maxHr}` : null,
  ].filter(Boolean);
  return `Entreno terminado${what.length > 0 ? `: ${what.join(", ")}` : ""}. Nota de Pulso: ${score.score}/10.\n${url}`;
}

/** The spider's eight arms: the sixteen muscles, the small ones with their neighbours. */
const ARMS: [string, Zone[]][] = [
  ["Pecho", ["pecho"]],
  ["Hombros", ["hombros"]],
  ["Brazos", ["biceps", "triceps", "antebrazos"]],
  ["Espalda", ["espalda", "trapecio", "lumbares"]],
  ["Core", ["abdomen", "oblicuos"]],
  ["Glúteos", ["gluteos"]],
  ["Cuádriceps", ["cuadriceps"]],
  ["Isquios y gemelos", ["isquios", "aductores", "gemelos", "tibial"]],
];

/** What a session worked, arm by arm, in sets (one decimal: a helper muscle gets half). */
export function spiderOf(muscles: Work): { label: string; sets: number }[] {
  return ARMS.map(([label, zones]) => ({ label, sets: Math.round(zones.reduce((n, z) => n + (muscles[z] ?? 0), 0) * 10) / 10 }));
}
