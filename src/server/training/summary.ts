import type { FactData } from "~/db/schema";
import { addDays, daysBetween } from "~/lib/day";
import { exerciseName, exerciseOf, sportOf, ZONES, zonesIn, type Sport, type Work, type Zone } from "~/lib/exercises";
import { kindKey } from "~/lib/renders";
import { nextTraining, READY, type Next } from "./next";

/**
 * His trainings as he reads them: what he did each day, how many sets each
 * muscle got this week, and how much he lifts over time. Weights by set and
 * role, sports by time (`~/lib/exercises`). Pure: the rows come from
 * `queries/training.ts`.
 */
export interface TrainingFact {
  day: string;
  summary: string;
  data: FactData;
  /** When he told it: the session runs from the first to the last. */
  at?: Date;
}

/** A WHOOP workout: it knows the minutes, not the exercises. */
export interface Workout {
  day: string;
  sport: string;
  minutes: number;
  /** What the band measured, for «Lo que haces»: start, effort, pulse and calories. */
  start?: Date;
  strain?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  kcal?: number | null;
}

/** A move learned from the web (`~/server/training/learn`). */
export interface Learned {
  key: string;
  name: string;
  byTime: boolean;
  /** Null until the web said. */
  work: Work | null;
  how: string | null;
  /** Its two poses are drawn, side by side: `mov-<key>`. */
  drawn: boolean;
}

type Entry = NonNullable<FactData["exercises"]>[number];

/** One set as he said it: what is missing stays null («Zancadas a 20 kg»: no reps). */
export interface SetRow {
  kg: number | null;
  reps: number | null;
  seconds: number | null;
}

export interface SessionLine {
  name: string;
  /** «3×8 · 80 kg», «80 kg ×8 · 85 kg ×6», «6 km · 32 min». */
  text: string;
  /** Each set on its own: «80 kg ×8», «45 s», «×10». Empty when only the count is known, and for a sport. */
  sets: string[];
  /** The same sets as numbers, for the detail. */
  detail: SetRow[];
  /** With dumbbells: the kilos he says are each hand's, so what he moved is twice (Javier, 15-nov-2026). */
  perHand?: true;
  /** A sport or WHOOP's «Pesas»: by time, not by sets. */
  sport?: true;
  move: Learned | null;
  /** Not known yet: the web is being asked what it works. */
  learning?: true;
}

export interface Session {
  day: string;
  lines: SessionLine[];
  /** What he said when there is nothing to break down: «Gimnasio: pierna». */
  said: string[];
  /** WHOOP's minutes, else the ones he said. */
  minutes: number | null;
  /** The saved routine it was all or part of (`training_routines`). */
  routineId: number | null;
  /** That routine by name, and how many of its exercises this day did: set by `queries/training`. */
  routine?: { name: string; done: number; of: number };
  /** From the first thing he told (or the band's start) to the last (or its end); null when neither has a time. */
  span: { from: Date; to: Date } | null;
  /** The sets each muscle got that day, for its spider (`~/lib/workout` `spiderOf`). */
  muscles?: Work;
}

/** What gave a muscle its sets: «Sentadilla» 4, «Correr» 2,1. */
export interface Part {
  label: string;
  sets: number;
}

export interface ZoneWeek {
  zone: Zone;
  /** Sets in the last 7 days, sports counted by time. */
  sets: number;
  /** What is still in the muscle today: the last days' sets, fading (`LEFT`). Above 5, loaded; under 1, ready. */
  fatigue: number;
  from: Part[];
  last: string | null;
}

export interface Lift {
  name: string;
  work: Work;
  move: Learned | null;
  /** The heaviest set of each day, oldest first, with all that day's sets in `sets`. */
  points: { day: string; kg: number; reps: number | null; sets: string }[];
  /** Kilos gained since the first point within `CHANGE_WEEKS`; null with one day. */
  change: number | null;
}

/** A saved routine (`./routines`) as Entrenos shows it: each exercise with its drawing. */
export interface RoutineCard {
  id: number;
  name: string;
  exercises: { name: string; text: string; move: Learned | null }[];
  last: { day: string; done: number } | null;
}

/** A sport (or «Pesas») over the year: what each time measured. */
export interface KindTimes {
  name: string;
  /** Its drawing: `mov-<key>`. */
  move: Learned | null;
  times: { day: string; start: Date | null; minutes: number | null; strain: number | null; avgHr: number | null; maxHr: number | null; kcal: number | null }[];
}

export interface Training {
  sessions: Session[];
  /** Every training day of the year, for the heatmap: weights, a sport, or a walk and the like. */
  year: { day: string; kind: "pesas" | "deporte" | "otro" }[];
  /** «Lo que haces», the most done first. */
  kinds: KindTimes[];
  zones: ZoneWeek[];
  lifts: Lift[];
  next: Next;
  routines: RoutineCard[];
}

const WEEK = 7;
/** How much of a day's sets is still in the muscle after 0, 1, 2 and 3 days: gone by the fourth (48 to 72 h to recover). */
const LEFT = [1, 0.7, 0.4, 0.15];
const CHANGE_WEEKS = 8;
/** A session told only in words («Gimnasio: pierna»): about three sets for each muscle it names. */
const SAID_SETS = 3;
/** A sport with neither minutes nor km said. */
const DEFAULT_MINUTES = 30;
/** WHOOP sometimes leaves one running for hours (a 319-minute «swimming»): no session counts past this. */
const MAX_MINUTES = 120;
const GYM = new Set(["weightlifting", "powerlifting", "functional-fitness", "strength-trainer", "crossfit"]);

const num = (n: number) => Number(n.toFixed(1)).toLocaleString("es-ES");
const kg = (n: number) => `${num(n)} kg`;

/** One exercise of one day, its sets together. */
export function setsText(entries: Entry[]): string {
  const same = entries.every((e) => e.reps === entries[0]!.reps && e.weightKg === entries[0]!.weightKg && e.seconds === entries[0]!.seconds);
  if (same) {
    const e = entries[0]!;
    const sets = entries.reduce((n, x) => n + (x.sets ?? 1), 0);
    const work = e.reps ? `${sets}×${e.reps}` : e.seconds ? `${sets}×${num(e.seconds)} s` : `${sets} ${sets === 1 ? "serie" : "series"}`;
    return e.weightKg ? `${work} · ${kg(e.weightKg)}` : work;
  }
  return entries
    .flatMap((e) =>
      Array.from({ length: e.sets ?? 1 }, () =>
        [e.weightKg ? kg(e.weightKg) : null, e.reps ? `×${e.reps}` : e.seconds ? `${num(e.seconds)} s` : null].filter(Boolean).join(" "),
      ),
    )
    .join(" · ");
}

/** One exercise of one day, set by set, as the pills of a session. */
export function setsOf(entries: Entry[]): string[] {
  return entries.flatMap((e) => {
    const one = [e.weightKg ? kg(e.weightKg) : null, e.reps ? `×${e.reps}` : e.seconds ? `${num(e.seconds)} s` : null].filter(Boolean).join(" ");
    return one ? Array.from({ length: e.sets ?? 1 }, () => one) : [];
  });
}

/** One exercise of one day, set by set, as numbers. */
export function detailOf(entries: Entry[]): SetRow[] {
  return entries.flatMap((e) => Array.from({ length: e.sets ?? 1 }, () => ({ kg: e.weightKg ?? null, reps: e.reps ?? null, seconds: e.seconds ?? null })));
}

/** «Andar 45 min», «Pádel 1 h», «hora y media de bici». */
export function minutesIn(text: string): number | null {
  const t = text.toLowerCase();
  if (/hora y media/.test(t)) return 90;
  const m = /(\d+(?:[.,]\d+)?)\s*(h\b|horas?|min)/.exec(t);
  if (!m) return null;
  const n = Number(m[1]!.replace(",", "."));
  return m[2]!.startsWith("min") ? n : n * 60;
}

const nameOf = (e: Entry) => exerciseName(e.name);
const sportOfFact = (f: TrainingFact) => (f.data.training === "run" ? sportOf("correr") : sportOf(f.summary));

interface Day {
  session: Session;
  /** Sets per muscle that day, with where they came from. */
  load: { zone: Zone; label: string; sets: number }[];
  /** Each exercise's entries that day, for the lifts. */
  groups: Map<string, Entry[]>;
}

export const learnedOf = (learned: Learned[], name: string) => learned.find((l) => l.key === kindKey(name)) ?? null;

function dayOf(day: string, facts: TrainingFact[], workouts: Workout[], learned: Learned[]): Day {
  const load: Day["load"] = [];
  const give = (work: Work, label: string, sets: number) => {
    for (const [zone, w] of Object.entries(work) as [Zone, number][]) load.push({ zone, label, sets: w * sets });
  };
  const lines: SessionLine[] = [];
  const said: string[] = [];

  const groups = new Map<string, Entry[]>();
  const perHand = new Set<string>();
  for (const f of facts) {
    for (const e of f.data.exercises ?? []) {
      groups.set(nameOf(e), [...(groups.get(nameOf(e)) ?? []), e]);
      // «Press inclinado con mancuerna 3x10 a 24 kg»: the name he gave may drop it, what he said keeps it.
      if (/mancuern/i.test(`${e.name} ${f.summary}`)) perHand.add(nameOf(e));
    }
  }
  for (const [name, es] of groups) {
    const work = exerciseOf(name)?.work ?? learnedOf(learned, name)?.work ?? null;
    const move = learnedOf(learned, name);
    lines.push({
      name,
      text: setsText(es),
      sets: setsOf(es),
      detail: detailOf(es),
      move,
      ...(perHand.has(name) ? { perHand: true as const } : {}),
      ...(work || !move ? {} : { learning: true as const }),
    });
    if (work) give(work, name, es.reduce((n, e) => n + (e.sets ?? 1), 0));
  }

  // Sports: WHOOP's minutes first, then the ones he said; what he said adds the km. One per sport a day.
  const sports = new Map<string, { sport: Sport; minutes: number | null; said: number | null; km: number | null }>();
  for (const w of workouts) {
    const sport = sportOf(w.sport);
    if (!sport) continue;
    const s = sports.get(sport.name) ?? { sport, minutes: 0, said: null, km: null };
    s.minutes = (s.minutes ?? 0) + w.minutes;
    sports.set(sport.name, s);
  }
  for (const f of facts.filter((f) => (f.data.exercises ?? []).length === 0)) {
    const known = f.data.kind ? learned.find((l) => l.byTime && l.key === f.data.kind) : undefined;
    const sport = sportOfFact(f) ?? (known ? { name: known.name, work: known.work ?? {}, minPerKm: null, match: [], whoop: [] } : null);
    if (sport) {
      const s = sports.get(sport.name) ?? { sport, minutes: null, said: null, km: null };
      if (f.data.distanceKm) s.km = (s.km ?? 0) + f.data.distanceKm;
      const said = minutesIn(f.summary);
      if (said) s.said = (s.said ?? 0) + said;
      sports.set(sport.name, s);
      continue;
    }
    said.push(f.summary);
    for (const zone of zonesIn(f.summary)) load.push({ zone, label: f.summary, sets: SAID_SETS });
  }
  for (const { sport, minutes: whoop, said: told, km } of sports.values()) {
    const minutes = whoop ?? told;
    const min = minutes ?? (km && sport.minPerKm ? km * sport.minPerKm : DEFAULT_MINUTES);
    const text = [km ? `${num(km)} km` : null, minutes ? `${Math.round(minutes)} min` : null].filter(Boolean).join(" · ");
    lines.push({ name: sport.name, text, sets: [], detail: [], sport: true, move: learnedOf(learned, sport.name), ...(Object.keys(sport.work).length === 0 ? { learning: true as const } : {}) });
    give(sport.work, sport.name, Math.min(min, MAX_MINUTES) / 30);
  }

  // Weights WHOOP saw but he did not detail: the time, no muscles (it cannot know which).
  const gym = workouts.filter((w) => GYM.has(w.sport));
  if (gym.length > 0 && groups.size === 0 && said.length === 0) {
    lines.push({ name: "Pesas", text: `${Math.round(gym.reduce((n, w) => n + w.minutes, 0))} min`, sets: [], detail: [], sport: true, move: learnedOf(learned, "Pesas") });
  }
  const whoop = workouts.reduce((n, w) => n + Math.min(w.minutes, MAX_MINUTES), 0);
  const told = [...sports.values()].reduce((n, s) => n + (s.said ?? 0), 0);
  const total = whoop > 0 ? whoop : told;
  const minutes = total > 0 ? Math.round(total) : null;
  const routineId = facts.find((f) => f.data.routineId)?.data.routineId ?? null;
  const muscles: Work = {};
  for (const l of load) muscles[l.zone] = (muscles[l.zone] ?? 0) + l.sets;
  return { session: { day, lines, said, minutes, routineId, span: spanOf(facts, workouts), muscles }, load, groups };
}

/** The first and last time of the day: what he told, else the band's workouts. */
function spanOf(facts: TrainingFact[], workouts: Workout[]): Session["span"] {
  const times = [
    ...facts.flatMap((f) => (f.at ? [f.at.getTime()] : [])),
    ...workouts.flatMap((w) => (w.start ? [w.start.getTime(), w.start.getTime() + Math.min(w.minutes, MAX_MINUTES) * 60_000] : [])),
  ];
  return times.length > 0 ? { from: new Date(Math.min(...times)), to: new Date(Math.max(...times)) } : null;
}

const WALKS = new Set(["Andar", "Marcha"]);
const isGym = (s: Session) => s.said.length > 0 || s.lines.some((l) => !l.sport || l.name === "Pesas");

/** «Lo que haces»: each sport, and «Pesas» for every gym day, with what the band measured each time. */
export function kindsOf(sessions: Session[], workouts: Workout[], learned: Learned[]): KindTimes[] {
  const kinds = new Map<string, KindTimes>();
  const add = (name: string, move: Learned | null, day: string, found: Workout[], minutes: number | null) => {
    const k = kinds.get(name) ?? { name, move, times: [] };
    k.move ??= move;
    if (found.length === 0) k.times.push({ day, start: null, minutes, strain: null, avgHr: null, maxHr: null, kcal: null });
    for (const w of found) {
      k.times.push({ day, start: w.start ?? null, minutes: Math.round(w.minutes), strain: w.strain ?? null, avgHr: w.avgHr ?? null, maxHr: w.maxHr ?? null, kcal: w.kcal ?? null });
    }
    kinds.set(name, k);
  };
  for (const s of sessions) {
    const band = workouts.filter((w) => w.day === s.day);
    if (isGym(s)) add("Pesas", learnedOf(learned, "Pesas"), s.day, band.filter((w) => GYM.has(w.sport)), s.minutes);
    for (const l of s.lines.filter((l) => l.sport && l.name !== "Pesas")) {
      add(l.name, l.move, s.day, band.filter((w) => sportOf(w.sport)?.name === l.name), minutesIn(l.text));
    }
  }
  return [...kinds.values()].sort((a, b) => b.times.length - a.times.length);
}

/** The heatmap's colour: weights, a sport, or only a walk. */
export function yearOf(sessions: Session[]): Training["year"] {
  return sessions.map((s) => ({
    day: s.day,
    kind: isGym(s) ? "pesas" : s.lines.some((l) => l.sport && !WALKS.has(l.name)) ? "deporte" : "otro",
  }));
}

export function summarize(facts: TrainingFact[], today: string, workouts: Workout[] = [], learned: Learned[] = []): Omit<Training, "routines"> {
  const dates = [...new Set([...facts.map((f) => f.day), ...workouts.map((w) => w.day)])].sort((a, b) => b.localeCompare(a));
  const days = dates
    .map((d) => dayOf(d, facts.filter((f) => f.day === d), workouts.filter((w) => w.day === d), learned))
    .filter((d) => d.session.lines.length + d.session.said.length > 0);

  const since = addDays(today, -(WEEK - 1));
  const fade = (zone: Zone, day: string) =>
    days.reduce((n, d) => n + (LEFT[daysBetween(d.session.day, day)] ?? 0) * d.load.filter((l) => l.zone === zone).reduce((m, l) => m + l.sets, 0), 0);
  const zones: ZoneWeek[] = ZONES.map((zone) => {
    const parts = new Map<string, number>();
    for (const d of days.filter((d) => d.session.day >= since)) {
      for (const l of d.load.filter((l) => l.zone === zone)) parts.set(l.label, (parts.get(l.label) ?? 0) + l.sets);
    }
    const from = [...parts.entries()].map(([label, sets]) => ({ label, sets })).sort((a, b) => b.sets - a.sets);
    return {
      zone,
      sets: from.reduce((n, p) => n + p.sets, 0),
      fatigue: fade(zone, today),
      from,
      last: days.find((d) => d.load.some((l) => l.zone === zone))?.session.day ?? null,
    };
  });

  const from = addDays(today, -CHANGE_WEEKS * 7);
  const lifts = new Map<string, Lift>();
  for (const d of [...days].reverse()) {
    for (const [name, es] of d.groups) {
      const top = es.filter((e) => e.weightKg).sort((a, b) => b.weightKg! - a.weightKg!)[0];
      if (!top) continue;
      const lift = lifts.get(name) ?? { name, work: exerciseOf(name)?.work ?? learnedOf(learned, name)?.work ?? {}, move: learnedOf(learned, name), points: [], change: null };
      lift.points.push({ day: d.session.day, kg: top.weightKg!, reps: top.reps ?? null, sets: setsText(es) });
      lifts.set(name, lift);
    }
  }
  for (const lift of lifts.values()) {
    const recent = lift.points.filter((p) => p.day >= from);
    lift.change = recent.length >= 2 ? recent.at(-1)!.kg - recent[0]!.kg : null;
  }

  return {
    sessions: days.map((d) => d.session),
    year: yearOf(days.map((d) => d.session)),
    kinds: kindsOf(
      days.map((d) => d.session),
      workouts,
      learned,
    ),
    zones,
    // Trained today: what comes next is tomorrow's.
    next:
      days[0]?.session.day === today && days[0].load.some((l) => l.sets >= READY)
        ? nextTraining(zones.map((z) => ({ ...z, fatigue: fade(z.zone, addDays(today, 1)) })), today, "Mañana")
        : nextTraining(zones, today),
    lifts: [...lifts.values()].sort((a, b) => b.points.at(-1)!.day.localeCompare(a.points.at(-1)!.day)),
  };
}
