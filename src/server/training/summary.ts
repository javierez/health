import type { FactData } from "~/db/schema";
import { addDays, daysBetween } from "~/lib/day";
import { exerciseOf, sportOf, ZONES, zonesIn, type Sport, type Work, type Zone } from "~/lib/exercises";
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
}

/** A WHOOP workout: it knows the minutes, not the exercises. */
export interface Workout {
  day: string;
  sport: string;
  minutes: number;
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

export interface SessionLine {
  name: string;
  /** «3×8 · 80 kg», «80 kg ×8 · 85 kg ×6», «6 km · 32 min». */
  text: string;
  /** Not known yet: the web is being asked what it works. */
  learning?: true;
}

export interface Session {
  day: string;
  lines: SessionLine[];
  /** What he said when there is nothing to break down: «Gimnasio: pierna». */
  said: string[];
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

export interface Training {
  sessions: Session[];
  zones: ZoneWeek[];
  lifts: Lift[];
  next: Next;
}

const WEEK = 7;
/** How much of a day's sets is still in the muscle after 0, 1, 2 and 3 days: gone by the fourth (48 to 72 h to recover). */
const LEFT = [1, 0.7, 0.4, 0.15];
const CHANGE_WEEKS = 8;
const SESSIONS = 12;
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
  const same = entries.every((e) => e.reps === entries[0]!.reps && e.weightKg === entries[0]!.weightKg);
  if (same) {
    const e = entries[0]!;
    const sets = entries.reduce((n, x) => n + (x.sets ?? 1), 0);
    const work = e.reps ? `${sets}×${e.reps}` : `${sets} ${sets === 1 ? "serie" : "series"}`;
    return e.weightKg ? `${work} · ${kg(e.weightKg)}` : work;
  }
  return entries
    .flatMap((e) => Array.from({ length: e.sets ?? 1 }, () => [e.weightKg ? kg(e.weightKg) : null, e.reps ? `×${e.reps}` : null].filter(Boolean).join(" ")))
    .join(" · ");
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

const nameOf = (e: Entry) => exerciseOf(e.name)?.name ?? e.name.trim();
const sportOfFact = (f: TrainingFact) => (f.data.training === "run" ? sportOf("correr") : sportOf(f.summary));

interface Day {
  session: Session;
  /** Sets per muscle that day, with where they came from. */
  load: { zone: Zone; label: string; sets: number }[];
  /** Each exercise's entries that day, for the lifts. */
  groups: Map<string, Entry[]>;
}

const learnedOf = (learned: Learned[], name: string) => learned.find((l) => l.key === kindKey(name)) ?? null;

function dayOf(day: string, facts: TrainingFact[], workouts: Workout[], learned: Learned[]): Day {
  const load: Day["load"] = [];
  const give = (work: Work, label: string, sets: number) => {
    for (const [zone, w] of Object.entries(work) as [Zone, number][]) load.push({ zone, label, sets: w * sets });
  };
  const lines: SessionLine[] = [];
  const said: string[] = [];

  const groups = new Map<string, Entry[]>();
  for (const e of facts.flatMap((f) => f.data.exercises ?? [])) groups.set(nameOf(e), [...(groups.get(nameOf(e)) ?? []), e]);
  for (const [name, es] of groups) {
    const work = exerciseOf(name)?.work ?? learnedOf(learned, name)?.work ?? null;
    lines.push({ name, text: setsText(es), ...(work || !learnedOf(learned, name) ? {} : { learning: true as const }) });
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
    lines.push({ name: sport.name, text, ...(Object.keys(sport.work).length === 0 ? { learning: true as const } : {}) });
    give(sport.work, sport.name, Math.min(min, MAX_MINUTES) / 30);
  }

  // Weights WHOOP saw but he did not detail: the time, no muscles (it cannot know which).
  const gym = workouts.filter((w) => GYM.has(w.sport));
  if (gym.length > 0 && groups.size === 0 && said.length === 0) {
    lines.push({ name: "Pesas", text: `${Math.round(gym.reduce((n, w) => n + w.minutes, 0))} min` });
  }
  return { session: { day, lines, said }, load, groups };
}

export function summarize(facts: TrainingFact[], today: string, workouts: Workout[] = [], learned: Learned[] = []): Training {
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
    sessions: days.slice(0, SESSIONS).map((d) => d.session),
    zones,
    // Trained today: what comes next is tomorrow's.
    next:
      days[0]?.session.day === today && days[0].load.some((l) => l.sets >= READY)
        ? nextTraining(zones.map((z) => ({ ...z, fatigue: fade(z.zone, addDays(today, 1)) })), today, "Mañana")
        : nextTraining(zones, today),
    lifts: [...lifts.values()].sort((a, b) => b.points.at(-1)!.day.localeCompare(a.points.at(-1)!.day)),
  };
}
