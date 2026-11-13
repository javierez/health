import { localDay, localMinutes } from "~/lib/day";

/**
 * WHEN the assistant writes. Pure and free: no model decides the timing, so a
 * bad Anthropic minute can make a message worse but never make it late, early
 * or twice.
 */
export interface Night {
  start: Date;
  end: Date;
  /** WHOOP's sleep need for that night, debt and strain included. */
  needMinutes: number | null;
  /** In bed minus awake: what he actually slept. */
  asleepMinutes?: number | null;
  /** When the band last reported this night. */
  seen?: Date;
}

/** Without WHOOP (or before it has two weeks), a sensible default. */
const DEFAULT_WAKE = 7 * 60 + 30;
const DEFAULT_NEED = 8 * 60;
/** Time to fall asleep, added in front of the need. */
const LATENCY = 15;
/** The bedtime alert goes out in the 40 minutes before bedtime. */
const LEAD = 40;

export interface BedtimePlan {
  wakeMinutes: number;
  needMinutes: number;
  /** Tonight's target: the ideal, or this week's step towards it. */
  bedMinutes: number;
  /** Wake-up minus the need: where the steps end. */
  idealMinutes: number;
}

/** A step is half an hour, and only taken when he is an hour or more past the ideal. */
const STEP = 30;
/** Evening clock on one line: 00:30 is 24:30, after 23:00 and not before it. */
export const line = (m: number) => (m < 12 * 60 ? m + 1440 : m);

/**
 * Bedtime = the usual wake-up time (median of the last 14 nights) minus what
 * WHOOP says tonight's sleep needs, minus fifteen minutes to fall asleep.
 * The median and not the mean: one 11:00 Sunday does not move a weekday.
 *
 * Asking someone who goes to bed at 02:37 to be in bed at 23:05 asks for
 * nothing (Javier, 17-oct-2026): while his usual bedtime is an hour or more
 * past the ideal, the target is half an hour before his usual one, on the
 * half hour (02:37 → 02:00), and moves as he does. His own cap («no más
 * tarde de la 01:00»), if earlier, wins.
 */
export function bedtimePlan(nights: Night[], capMinutes: number | null = null, now: Date | null = null): BedtimePlan {
  const recent = [...nights].sort((a, b) => b.end.getTime() - a.end.getTime()).slice(0, 14);
  const wakes = recent.map((n) => localMinutes(n.end)).sort((a, b) => a - b);
  const wakeMinutes = wakes.length > 0 ? wakes[Math.floor(wakes.length / 2)]! : DEFAULT_WAKE;
  // A need with a week-old debt in it is not tonight's: «9 h 31 que necesitas» from 31-oct, on 6-nov.
  const fresh = recent[0] && (now === null || bandSilentSince(recent, now) === null) ? recent[0].needMinutes : null;
  const needMinutes = Math.round(fresh ?? DEFAULT_NEED);
  const idealMinutes = (((wakeMinutes - needMinutes - LATENCY) % 1440) + 1440) % 1440;

  const beds = recent.map((n) => line(localMinutes(n.start))).sort((a, b) => a - b);
  const usual = beds.length > 0 ? beds[Math.floor(beds.length / 2)]! : null;
  let target = line(idealMinutes);
  if (usual !== null && usual - target >= 2 * STEP) target = Math.max(target, Math.floor((usual - STEP) / STEP) * STEP);
  if (capMinutes !== null) target = Math.min(target, line(capMinutes));
  return { wakeMinutes, needMinutes, bedMinutes: target % 1440, idealMinutes };
}

/** By 10:00 it is morning whatever the band says. */
const MORNING_BY = 10 * 60;

/**
 * The night has ended, not just the data so far: the band has seen him up for
 * 20 minutes, and the end is within two hours of his usual wake-up or it is
 * already 10:00.
 * 🚨 Not 20 minutes alone: Edge sends the night so far while he sleeps, and
 * resends every night on each push, so `seen` keeps moving. On 22-oct-2026 the
 * night "ended" at 04:53, a push at 05:20 saw it 27 min later, and the note
 * said «Noche fatal: 3 h 11»; he slept until 08:40 (his usual: 09:25).
 */
export function nightOver(end: Date, seen: Date | null, wakeMinutes: number, now: Date): boolean {
  if (seen === null || seen.getTime() - end.getTime() < 20 * 60_000) return false;
  return localMinutes(end) >= wakeMinutes - 120 || localDay(now) !== localDay(end) || localMinutes(now) >= MORNING_BY;
}

export type MessageKind = "bedtime" | "morning" | "commitments";

export interface Due {
  kind: MessageKind;
  /** The key that makes it once a day. An evening runs until 06:00. */
  day: string;
}

export function dueMessages(
  now: Date,
  /** `seen`: when the band last reported (the row's `fetchedAt`). */
  input: { plan: BedtimePlan; lastWake: Date | null; seen: Date | null; sent: Set<string> },
): Due[] {
  const out: Due[] = [];
  const nowMin = localMinutes(now);

  const evening = localDay(new Date(now.getTime() - 6 * 3_600_000));
  const untilBed = (input.plan.bedMinutes - nowMin + 1440) % 1440;
  if (untilBed <= LEAD && !input.sent.has(`bedtime:${evening}`)) {
    out.push({ kind: "bedtime", day: evening });
  }

  // The morning note waits until the night is over (`nightOver`), and goes out
  // at 10:00 regardless. Never after 13:00: by then it is not a morning.
  const today = localDay(now);
  const wokeToday = input.lastWake !== null && localDay(input.lastWake) === today;
  const over = wokeToday && nightOver(input.lastWake!, input.seen, input.plan.wakeMinutes, now);
  if ((over || nowMin >= MORNING_BY) && nowMin < 13 * 60 && !input.sent.has(`morning:${today}`)) {
    out.push({ kind: "morning", day: today });
  }

  return out;
}

/**
 * Nights in a row under `minutes` asleep, newest first; an unknown night ends
 * the run. Counted here because the model miscounts: on 26-oct-2026 it wrote
 * «sexta noche seguida bajo 7h» over a week with 7 h 06 and 7 h 31 in it.
 */
export function nightsInARowUnder(asleep: (number | null)[], minutes = 7 * 60): number {
  const end = asleep.findIndex((a) => a === null || a >= minutes);
  return end === -1 ? asleep.length : end;
}

/** Past this since the last night ended, there is a night the band never sent. */
const SILENT_AFTER = 36 * 3_600_000;

/**
 * The end of the newest night when the band has sent none since, or null.
 * Edge kept posting the same body from 31-oct to 7-nov-2026 without a new
 * night, and every note read the 31-oct night as last night's («Noche corta,
 * 6h07» on 6-nov).
 */
export function bandSilentSince(nights: Pick<Night, "end">[], now: Date): Date | null {
  const last = nights.reduce<Date | null>((a, n) => (a === null || n.end > a ? n.end : a), null);
  return last !== null && now.getTime() - last.getTime() > SILENT_AFTER ? last : null;
}

/**
 * Without the band, the most he can have slept the night before `wakeDay`:
 * from his last message before 04:00 (from 20:00 the evening before) to his
 * first one after it, before 13:00. A ceiling, not sleep: lying awake in bed
 * counts too. `times` are only his own (Vesta's 07:45 «Tu día» goes out from
 * his number: the caller leaves it out). On 6-nov-2026: 23:22 → 08:23, 9 h 01,
 * while the note said «6h07».
 */
export function quietNight(times: Date[], wakeDay: string): { from: Date; to: Date; minutes: number } | null {
  const eve = localDay(new Date(new Date(`${wakeDay}T12:00:00Z`).getTime() - 86_400_000));
  const sorted = [...times].sort((a, b) => a.getTime() - b.getTime());
  const night = (t: Date) => (localDay(t) === eve && localMinutes(t) >= 20 * 60) || (localDay(t) === wakeDay && localMinutes(t) < 4 * 60);
  const from = sorted.filter(night).at(-1);
  const to = sorted.find((t) => localDay(t) === wakeDay && localMinutes(t) >= 4 * 60 && localMinutes(t) < 13 * 60);
  return from && to ? { from, to, minutes: Math.round((to.getTime() - from.getTime()) / 60_000) } : null;
}

export function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
