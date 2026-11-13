import type { Activity, FactData, Metric, Period, Proof } from "~/db/schema";
import { addDays, localDay, localMinutes } from "~/lib/day";
import { isRoutine, ROUTINE_TITLE, type Member } from "~/lib/routines";

/**
 * Where each commitment stands, and WHEN to say so. Pure and free, like
 * `~/server/assistant/plan`: the model only writes the words, so a bad minute
 * at Anthropic can make a nudge worse but never make it late or twice.
 *
 * 🚨 Progress is never typed in as a number. It is read from what already
 * arrives: WHOOP workouts and the training facts from the chat and the Pocket
 * (a session seen by both counts once, see `dedupe`), and the days he ticked
 * off, in the panel or with a photo in the chat. A bedtime is read from
 * WHOOP's nights and only from them: it cannot be ticked. Water is the litres
 * he says he drank (`waterMl` on his meals), and cannot be ticked either.
 */
export interface Commitment {
  id: number;
  title: string;
  /** What counts. "4 km corriendo o en bici" is ["run", "bike"]. */
  activities: Activity[];
  metric: Metric;
  target: number;
  period: Period;
  proof: Proof;
}

/** A day he ticked off for a commitment. `photo` when a photo proved it. */
export interface Check {
  day: string;
  commitmentId: number;
  photo: boolean;
}

/** When he went to bed, filed under the evening it began (00:40 on Friday is Thursday's night). */
export interface Bedtime {
  day: string;
  /** Local clock minutes, 0–1439. */
  clock: number;
}

/** Anything that starts before noon belongs to the evening before. */
export function bedtimeOf(start: Date): Bedtime {
  return { day: localDay(new Date(start.getTime() - 12 * 3_600_000)), clock: localMinutes(start) };
}

/** Minutes after noon, so 23:30 (690) comes before 01:00 (780). */
export const sinceNoon = (clock: number) => (clock - 720 + 1440) % 1440;

/** A drink with water in it, from the chat. */
export interface Drink {
  at: Date;
  liters: number;
}

export interface Session {
  at: Date;
  activity: Activity;
  km: number | null;
  minutes: number | null;
  source: "whoop" | "fact";
}

const WHOOP_SPORT: Record<string, Activity> = {
  weightlifting: "gym",
  powerlifting: "gym",
  "functional-fitness": "gym",
  "strength-trainer": "gym",
  crossfit: "gym",
  running: "run",
  "track-and-field": "run",
  cycling: "bike",
  "mountain-biking": "bike",
  spin: "bike",
};

export function whoopActivity(sport: string | null | undefined): Activity | null {
  return sport ? (WHOOP_SPORT[sport] ?? null) : null;
}

/** The facts only know gym · run · other; a ride is an "other" that says so. */
export function factActivity(training: string | undefined, summary: string): Activity | null {
  if (training === "gym" || training === "run") return training;
  return /\b(bici|bicicleta|ciclismo|spinning|rodillo)\b/i.test(summary) ? "bike" : null;
}

/**
 * He says "he ido al gimnasio" an hour after WHOOP logged it: one session.
 * Same for the chat on its own: squats, then bench, then a video of a set is
 * one gym session, with its kilometres or minutes added up.
 */
const SAME_SESSION_MS = 3 * 3_600_000;

export function dedupe(sessions: Session[]): Session[] {
  const whoop = sessions.filter((s) => s.source === "whoop");
  const near = (a: Session, b: Session) => a.activity === b.activity && Math.abs(a.at.getTime() - b.at.getTime()) < SAME_SESSION_MS;
  const facts: Session[] = [];
  for (const f of sessions.filter((s) => s.source === "fact").sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (whoop.some((w) => near(w, f))) continue;
    const same = facts.find((k) => near(k, f));
    if (!same) facts.push({ ...f });
    else {
      same.km = same.km === null && f.km === null ? null : (same.km ?? 0) + (f.km ?? 0);
      same.minutes = same.minutes === null && f.minutes === null ? null : (same.minutes ?? 0) + (f.minutes ?? 0);
    }
  }
  return [...whoop, ...facts].sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * Every session, one each: the band's workouts and the trainings he told the
 * chat. Since WHOOP's subscription went, the band (Edge) detects none, so the
 * told ones are all there is: a count from workouts alone said «0 sesiones de
 * fuerza» the week of his 21-oct leg day.
 */
export function sessionsFrom(
  workouts: { label: string | null; startAt: Date | null; durationSeconds: number | null; raw: unknown }[],
  told: { at: Date; summary: string; data: Pick<FactData, "training" | "distanceKm"> }[],
): Session[] {
  return dedupe([
    ...workouts.flatMap((w): Session[] => {
      const activity = whoopActivity(w.label);
      if (!activity || !w.startAt) return [];
      const meters = (w.raw as { score?: { distance_meter?: number } | null }).score?.distance_meter;
      return [{ at: w.startAt, activity, km: meters ? meters / 1000 : null, minutes: w.durationSeconds ? Math.round(w.durationSeconds / 60) : null, source: "whoop" }];
    }),
    ...told.flatMap((f): Session[] => {
      const activity = factActivity(f.data.training, f.summary);
      return activity ? [{ at: f.at, activity, km: f.data.distanceKm ?? null, minutes: null, source: "fact" }] : [];
    }),
  ]);
}

/** Monday of this week in Madrid, `YYYY-MM-DD`. The week runs Monday to Sunday. */
export function weekStart(now: Date): string {
  const today = localDay(now);
  const fromMonday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(today, -fromMonday);
}

export type Status = "done" | "on-pace" | "behind" | "tight" | "pending";

export interface DayMark {
  day: string;
  value: number;
  /** What filled it: the data, a tick, a photo. Null when nothing did. */
  by: "auto" | "check" | "photo" | null;
  /** A bedtime commitment: when he went to bed that night. */
  clock?: number;
}

export interface Standing {
  commitment: Commitment;
  /** A week commitment: this week's total. A day one: today's. */
  done: number;
  left: number;
  /** Today included. A week commitment on Sunday has 1. */
  daysLeft: number;
  doneToday: boolean;
  status: Status;
  /** Monday to Sunday, whatever the period: the strip the board draws. */
  days: DayMark[];
  /** Where the pace says he should be when today ends. The tick on the ring. */
  pace: number;
  /** A day commitment: days in a row it was met, today or up to yesterday. */
  streak: number;
  /** He can tick it in the panel: a habit, or a count of sessions he did without WHOOP. */
  tickable: boolean;
  /** A routine (`~/lib/routines`): the products one tick marks. */
  members?: Member[];
}

export function standing(c: Commitment, sessions: Session[], checks: Check[], now: Date, nights: Bedtime[] = [], drinks: Drink[] = []): Standing {
  if (c.metric === "bedtime") return bedtimeStanding(c, nights, now);
  const today = localDay(now);
  const monday = weekStart(now);
  const worth = (s: Session) => (c.metric === "sessions" ? 1 : ((c.metric === "km" ? s.km : s.minutes) ?? 0));
  const ticked = new Map(checks.filter((k) => k.commitmentId === c.id).map((k) => [k.day, k.photo]));
  const habit = c.activities.length === 0;

  const mark = (day: string): DayMark => {
    const auto = round(
      c.metric === "liters"
        ? drinks.filter((d) => localDay(d.at) === day).reduce((n, d) => n + d.liters, 0)
        : sessions.filter((s) => c.activities.includes(s.activity) && localDay(s.at) === day).reduce((n, s) => n + worth(s), 0),
    );
    if (auto > 0) return { day, value: auto, by: "auto" };
    // A tick is one: one pill, one session he did without WHOOP. It cannot
    // say how many kilometres, so a km commitment only counts the data.
    const photo = ticked.get(day);
    if (photo !== undefined && (habit || c.metric === "sessions")) return { day, value: 1, by: photo ? "photo" : "check" };
    return { day, value: 0, by: null };
  };

  const days = Array.from({ length: 7 }, (_, i) => mark(addDays(monday, i)));
  const todayMark = days.find((d) => d.day === today) ?? mark(today);
  // A glass is not the day's water: it is done once the litres are in.
  const doneToday = c.metric === "liters" ? todayMark.value >= c.target : todayMark.value > 0;
  // Only what nothing can show is ticked (16-oct-2026): a training WHOOP missed
  // is told to the chat, which writes the fact that counts.
  // An old «photo» one is ticked too: no habit asks for a photo (22-oct-2026).
  const tickable = c.proof !== "auto";

  if (c.period === "day") {
    const done = todayMark.value;
    const left = round(Math.max(0, c.target - done));
    // «Antes de entrenar» is owed only on a day he trained: a rest day neither asks nor breaks the streak.
    const owed = (day: string) => c.title !== ROUTINE_TITLE.entreno || sessions.some((s) => localDay(s.at) === day);
    let streak = 0;
    for (let day = left === 0 ? today : addDays(today, -1), n = 0; n < 365; day = addDays(day, -1), n += 1) {
      if (mark(day).value >= c.target) streak += 1;
      else if (owed(day)) break;
    }
    const status = left === 0 ? "done" : owed(today) ? "pending" : "on-pace";
    return { commitment: c, done, left, daysLeft: 1, doneToday, status, days, pace: c.target, streak, tickable };
  }

  const done = round(days.filter((d) => d.day <= today).reduce((n, d) => n + d.value, 0));
  const left = round(Math.max(0, c.target - done));
  const daysLeft = daysUntilSunday(today) + 1;
  const elapsed = 7 - daysLeft;
  // Sessions are one a day: 3 left with 3 days to go is every day from now.
  // Kilometres and minutes can bunch up, so for them only the pace matters.
  const expected = (c.target * elapsed) / 7;
  const status: Status =
    left === 0
      ? "done"
      : c.metric === "sessions" && left >= daysLeft
        ? "tight"
        : done < expected
          ? "behind"
          : "on-pace";
  const pace = round((c.target * (elapsed + 1)) / 7);
  return { commitment: c, done, left, daysLeft, doneToday, status, days, pace, streak: 0, tickable };
}

/**
 * "Never later than 01:00": each night is in or out, from WHOOP alone. Tonight
 * is still to come, so the week counts up to last night and so does the
 * streak. Last night late is "behind": that is the evening to say something.
 */
function bedtimeStanding(c: Commitment, nights: Bedtime[], now: Date): Standing {
  const today = localDay(now);
  const monday = weekStart(now);
  const byDay = new Map<string, number>();
  // Two sleeps filed under one evening (he woke up and went back): the first.
  for (const n of nights) if (!byDay.has(n.day) || sinceNoon(n.clock) < sinceNoon(byDay.get(n.day)!)) byDay.set(n.day, n.clock);
  const met = (day: string) => {
    const clock = byDay.get(day);
    return clock === undefined ? null : sinceNoon(clock) <= sinceNoon(c.target);
  };
  const days: DayMark[] = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i);
    const clock = byDay.get(day);
    if (day >= today || clock === undefined) return { day, value: 0, by: null };
    return { day, value: met(day) ? 1 : 0, by: "auto", clock };
  });
  let streak = 0;
  for (let day = addDays(today, -1); met(day) === true; day = addDays(day, -1)) {
    streak += 1;
    if (streak > 365) break;
  }
  const done = days.filter((d) => d.value > 0).length;
  const status: Status = met(addDays(today, -1)) === false ? "behind" : "on-pace";
  return { commitment: c, done, left: 0, daysLeft: 1, doneToday: false, status, days, pace: 0, streak, tickable: false };
}

function daysUntilSunday(today: string): number {
  return (7 - new Date(`${today}T12:00:00Z`).getUTCDay()) % 7;
}

const round = (n: number) => Math.round(n * 10) / 10;

const es = (n: number) => String(n).replace(".", ",");

const UNIT: Record<Metric, string> = { sessions: "", km: " km", minutes: " min", bedtime: "", liters: " L" };

/** "21,5 km", "3". Spanish decimals, the unit when there is one. */
export const amount = (n: number, metric: Metric) => `${es(n)}${UNIT[metric]}`;

/** "Gimnasio: 2 de 4, quedan 4 días, vas bien". The line the chat and the model read. */
export function describe(p: Standing): string {
  const { title, detail } = describeParts(p);
  return `${title}, ${detail}`;
}

/** A habit's kind is its name: «Meditar» gets the icon drawn for it (`~/server/kinds`). Water keeps the one drawn for «Agua». */
export const kindOf = (c: Commitment): string | null => (c.activities.length === 0 ? c.title : c.activities.includes("water") ? "Agua" : null);

/**
 * "faltan 10,3 km", "falta 1", "hecho", "hasta la 01:00": the board's count is
 * what is still to do, not what was done (Javier, 18-oct-2026: «¿qué me toca
 * ahora?… más que verlo a pasado»). A once-a-day habit has none.
 */
export function countOf(p: Standing): string | null {
  const c = p.commitment;
  if (c.metric === "bedtime") return `hasta ${laHora(c.target)}`;
  if (c.period === "day" && c.target === 1 && c.metric === "sessions") return null;
  if (p.left === 0) return "hecho";
  return `${p.left === 1 ? "falta" : "faltan"} ${amount(p.left, c.metric)}`;
}

/** "Gimnasio: 3 de 4". The chat's confirmation: the count, and how it goes only when it goes wrong. */
export function brief(p: Standing): string {
  const { title, detail } = describeParts(p);
  return p.status === "behind" || p.status === "tight" ? `${title}, ${detail}` : title;
}

/** «Marcado: en ayunas y media mañana.»: the routines one message ticked, in one line. */
export function tickedLine(titles: string[]): string | null {
  const low = titles.map((t) => t.charAt(0).toLowerCase() + t.slice(1));
  if (low.length === 0) return null;
  return `Marcado: ${low.length > 1 ? `${low.slice(0, -1).join(", ")} y ${low.at(-1)}` : low[0]}.`;
}

/** The same, split for the board: the numbers as the title, how it goes under it. */
export function describeParts(p: Standing): { title: string; detail: string } {
  if (p.commitment.metric === "bedtime") {
    const last = p.days.filter((d) => d.by === "auto").at(-1);
    const streak = p.streak > 1 ? `, ${p.streak} noches seguidas` : "";
    return {
      title: `${p.commitment.title}: no más tarde de ${laHora(p.commitment.target)}`,
      detail: last?.clock === undefined ? `sin noches esta semana${streak}` : `${p.status === "behind" ? "anoche te pasaste" : "última noche"}: a ${laHora(last.clock)}${streak}`,
    };
  }
  const u = UNIT[p.commitment.metric];
  const streak = p.streak > 1 ? `, ${p.streak} días seguidos` : "";
  // "La pastilla": once a day is done or not, there is nothing to count.
  if (p.commitment.period === "day" && p.commitment.target === 1 && p.commitment.metric === "sessions") {
    return { title: p.commitment.title, detail: `${p.status === "done" ? "hecho hoy" : "pendiente hoy"}${streak}` };
  }
  // Nothing told is not 0 litres (25-oct-2026: «agua 0 de 2» on a day he never said).
  if (p.commitment.metric === "liters" && p.done === 0) return { title: `${p.commitment.title}: ${es(p.commitment.target)}${u} hoy`, detail: `nada apuntado aún${streak}` };
  const title = `${p.commitment.title}: ${es(p.done)}${u} de ${es(p.commitment.target)}${u}${p.commitment.period === "day" ? " hoy" : ""}`;
  if (p.status === "done") return { title, detail: `cumplido${streak}` };
  if (p.commitment.period === "day") return { title, detail: `pendiente${streak}` };
  const when = p.daysLeft === 1 ? "queda hoy" : `quedan ${p.daysLeft} días`;
  const note =
    p.status === "tight"
      ? p.left > p.daysLeft
        ? "ya no da para todas"
        : "tiene que ser cada día"
      : p.status === "behind"
        ? "vas por detrás"
        : "vas bien";
  return { title, detail: `${when}, ${note}` };
}

/**
 * The nudge goes out once a day, from 18:00 until 21:00, and only if it is
 * needed. Never for a routine: the night one is always still to do at 18:00,
 * and the morning one is gone by then.
 */
const NUDGE_FROM = 18 * 60;
const NUDGE_UNTIL = 21 * 60;

export function nudgeDue(now: Date, all: Standing[], sent: Set<string>): { kind: "commitments"; day: string } | null {
  const day = localDay(now);
  const min = localMinutes(now);
  if (min < NUDGE_FROM || min >= NUDGE_UNTIL || sent.has(`commitments:${day}`)) return null;
  const needed = all.some(
    (p) => !p.doneToday && !isRoutine(p.commitment.title) && (p.status === "pending" || p.status === "behind" || p.status === "tight"),
  );
  return needed ? { kind: "commitments", day } : null;
}

export interface Busy {
  start: Date;
  end: Date;
}

/**
 * The gaps of at least `minMinutes` between `from` and `until` (local minutes)
 * on `day`, as "HH:MM-HH:MM". What the assistant offers as "when".
 */
export function freeWindows(
  day: string,
  busy: Busy[],
  { from = 7 * 60, until = 22 * 60, minMinutes = 75 } = {},
): string[] {
  const blocks = busy
    .filter((b) => localDay(b.start) <= day && localDay(b.end) >= day)
    .map((b) => [
      localDay(b.start) < day ? 0 : localMinutes(b.start),
      localDay(b.end) > day ? 1440 : localMinutes(b.end),
    ] as const)
    .sort((a, b) => a[0] - b[0]);
  const out: string[] = [];
  let cursor = from;
  for (const [s, e] of blocks) {
    const end = Math.min(s, until);
    if (end - cursor >= minMinutes) out.push(`${hhmm(cursor)}-${hhmm(end)}`);
    cursor = Math.max(cursor, e);
    if (cursor >= until) break;
  }
  if (until - cursor >= minMinutes) out.push(`${hhmm(cursor)}-${hhmm(until)}`);
  return out;
}

/** "la 01:05", "las 23:30". */
export const laHora = (m: number) => `${Math.floor(m / 60) === 1 ? "la" : "las"} ${hhmm(m)}`;

/** "01:05". */
export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
