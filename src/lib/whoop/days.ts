import { localDay, localMinutes } from "~/lib/day";

/**
 * WHOOP's screens, rebuilt from `whoop_records` (Javier, 20-oct-2026: «todas
 * las visualizaciones… exactamente iguales», in health's colours and behind a
 * tap). One `Day` per morning, whoever measured it: WHOOP's own rows for the
 * past year, Edge's `edge-…` stand-ins from the strap since the subscription
 * went. What Edge does not score is worked out the way WHOOP describes it
 * (need, performance and recovery when stored, consistency here), so a night
 * reads the same either way.
 */
export interface RecordRow {
  kind: string;
  externalId: string;
  startAt: Date | null;
  endAt: Date | null;
  score: number | null;
  label: string | null;
  raw: unknown;
}

export interface Workout {
  id: string;
  start: number;
  end: number | null;
  sport: string;
  strain: number | null;
  kcal: number | null;
  avgHr: number | null;
  maxHr: number | null;
  /** Minutes in zones 0–5 (WHOOP's % of heart-rate reserve). Empty when unscored. */
  zones: number[];
  distanceM: number | null;
}

export interface Night {
  start: number;
  end: number;
  inBedMin: number;
  sleepMin: number;
  awakeMin: number;
  lightMin: number;
  deepMin: number;
  remMin: number;
  disturbances: number | null;
  cycles: number | null;
  efficiency: number | null;
  consistency: number | null;
  performance: number | null;
  neededMin: number | null;
  debtMin: number | null;
  resp: number | null;
  /** Measured by the strap through Edge, not scored by WHOOP. */
  edge: boolean;
}

export interface Day {
  /** The morning: a night belongs to the day you woke into. */
  day: string;
  recovery: number | null;
  hrv: number | null;
  rhr: number | null;
  spo2: number | null;
  skinTemp: number | null;
  night: Night | null;
  strain: number | null;
  kcal: number | null;
  avgHr: number | null;
  maxHr: number | null;
  steps: number | null;
  /** Edge's 0–3 day stress; WHOOP's API has none. */
  stress: number | null;
  workouts: Workout[];
  z13Min: number;
  z45Min: number;
  strengthMin: number;
  /** WHOOP scored the day, or a workout came in: its zones and strength are real. Edge's alone detect no workout, so a 0 there is not a 0. */
  tracked: boolean;
}

/** Sports WHOOP files under strength: they count as «strength activity time». */
export const STRENGTH = new Set(["weightlifting", "powerlifting", "functional-fitness", "strength-trainer", "Strength"]);

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const min = (ms: unknown) => {
  const n = num(ms);
  return n === null ? null : n / 60_000;
};
const kcal = (kj: unknown) => {
  const n = num(kj);
  return n === null ? null : Math.round(n / 4.184);
};
const SIX_HOURS = 6 * 3_600_000;

function workout(r: RecordRow): Workout | null {
  if (!r.startAt) return null;
  const s = obj(obj(r.raw).score);
  const z = obj(s.zone_durations);
  const zones = ["zero", "one", "two", "three", "four", "five"].map((k) => min(z[`zone_${k}_milli`]) ?? 0);
  return {
    id: r.externalId,
    start: r.startAt.getTime(),
    end: r.endAt?.getTime() ?? null,
    sport: r.label ?? "activity",
    strain: num(s.strain),
    kcal: kcal(s.kilojoule),
    avgHr: num(s.average_heart_rate),
    maxHr: num(s.max_heart_rate),
    zones: zones.some((m) => m > 0) ? zones : [],
    distanceM: num(s.distance_meter),
  };
}

function night(r: RecordRow): Night | null {
  if (!r.startAt || !r.endAt) return null;
  const raw = obj(r.raw);
  if (raw.nap === true) return null;
  const s = obj(raw.score);
  const st = obj(s.stage_summary);
  const need = obj(s.sleep_needed);
  const inBed = min(st.total_in_bed_time_milli) ?? (r.endAt.getTime() - r.startAt.getTime()) / 60_000;
  const awake = min(st.total_awake_time_milli) ?? 0;
  const light = min(st.total_light_sleep_time_milli) ?? 0;
  const deep = min(st.total_slow_wave_sleep_time_milli) ?? 0;
  const rem = min(st.total_rem_sleep_time_milli) ?? 0;
  const neededParts = ["baseline_milli", "need_from_sleep_debt_milli", "need_from_recent_strain_milli", "need_from_recent_nap_milli"].map((k) => min(need[k]));
  return {
    start: r.startAt.getTime(),
    end: r.endAt.getTime(),
    inBedMin: inBed,
    sleepMin: light + deep + rem || Math.max(0, inBed - awake),
    awakeMin: awake,
    lightMin: light,
    deepMin: deep,
    remMin: rem,
    disturbances: num(st.disturbance_count),
    cycles: num(st.sleep_cycle_count),
    efficiency: num(s.sleep_efficiency_percentage),
    consistency: num(s.sleep_consistency_percentage),
    performance: num(s.sleep_performance_percentage),
    neededMin: neededParts[0] === null ? null : neededParts.reduce<number>((a, b) => a + (b ?? 0), 0),
    debtMin: neededParts[1] ?? null,
    resp: num(s.respiratory_rate),
    edge: r.externalId.startsWith("edge-"),
  };
}

function blank(day: string): Day {
  return { day, recovery: null, hrv: null, rhr: null, spo2: null, skinTemp: null, night: null, strain: null, kcal: null, avgHr: null, maxHr: null, steps: null, stress: null, workouts: [], z13Min: 0, z45Min: 0, strengthMin: 0, tracked: false };
}

/** Oldest first, one per morning that has anything. */
export function buildDays(rows: RecordRow[]): Day[] {
  const days = new Map<string, Day>();
  const at = (d: string) => days.get(d) ?? days.set(d, blank(d)).get(d)!;
  for (const r of rows) {
    const raw = obj(r.raw);
    const s = obj(raw.score);
    if (r.kind === "sleep") {
      const n = night(r);
      // Two sleeps closing the same morning: the longer one is the night.
      if (n && (at(localDay(new Date(n.end))).night?.sleepMin ?? -1) < n.sleepMin) at(localDay(new Date(n.end))).night = n;
    } else if (r.kind === "recovery" && r.startAt) {
      const d = at(localDay(r.startAt));
      d.tracked ||= !r.externalId.startsWith("edge-");
      d.recovery = num(s.recovery_score) ?? d.recovery;
      d.hrv = num(s.hrv_rmssd_milli) ?? d.hrv;
      d.rhr = num(s.resting_heart_rate) ?? d.rhr;
      d.spo2 = num(s.spo2_percentage) ?? d.spo2;
      d.skinTemp = num(s.skin_temp_celsius) ?? d.skinTemp;
    } else if (r.kind === "cycle" && r.startAt) {
      // A cycle opens when you fall asleep, often before midnight: six hours on, it is that morning's day.
      const d = at(localDay(new Date(r.startAt.getTime() + SIX_HOURS)));
      d.tracked ||= !r.externalId.startsWith("edge-");
      d.strain = num(s.strain) ?? d.strain;
      d.kcal = kcal(s.kilojoule) ?? d.kcal;
      d.avgHr = num(s.average_heart_rate) ?? d.avgHr;
      d.maxHr = num(s.max_heart_rate) ?? d.maxHr;
      d.steps = num(raw.step_count) ?? d.steps;
      d.stress = num(raw.stress) ?? d.stress;
    } else if (r.kind === "workout") {
      const w = workout(r);
      if (!w) continue;
      const d = at(localDay(new Date(w.start)));
      d.tracked = true;
      d.workouts.push(w);
      d.z13Min += (w.zones[1] ?? 0) + (w.zones[2] ?? 0) + (w.zones[3] ?? 0);
      d.z45Min += (w.zones[4] ?? 0) + (w.zones[5] ?? 0);
      if (STRENGTH.has(w.sport)) d.strengthMin += ((w.end ?? w.start) - w.start) / 60_000;
    }
  }
  const out = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  for (const d of out) d.workouts.sort((a, b) => a.start - b.start);
  fillEdgeNights(out);
  return out;
}

/** Bed and wake on one clock: 23:50 is −10, 00:20 is 20, so the gap is 30 minutes, not 1410. */
const bedClock = (ms: number) => {
  const m = localMinutes(new Date(ms));
  return m > 720 ? m - 1440 : m;
};
const wakeClock = (ms: number) => localMinutes(new Date(ms));

/**
 * Edge's nights carry no consistency: WHOOP's compares bed and wake with the
 * previous four nights. Same here. Their need and performance are already on
 * the row, worked out when they were stored (`server/edge/fill.ts`).
 */
export function fillEdgeNights(days: Day[]) {
  days.forEach((d, i) => {
    const n = d.night;
    if (!n?.edge) return;
    const prev = days.slice(Math.max(0, i - 4), i).flatMap((p) => (p.night ? [p.night] : []));
    if (n.consistency === null && prev.length > 0) {
      const gap = prev.reduce((a, p) => a + Math.abs(bedClock(p.start) - bedClock(n.start)) + Math.abs(wakeClock(p.end) - wakeClock(n.end)), 0) / (2 * prev.length);
      n.consistency = Math.round(Math.max(0, Math.min(100, 100 - gap * 0.8)));
    }
    if (n.efficiency === null && n.inBedMin > 0) n.efficiency = Math.round((n.sleepMin / n.inBedMin) * 100);
  });
}
