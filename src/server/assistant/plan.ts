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
const line = (m: number) => (m < 12 * 60 ? m + 1440 : m);

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
export function bedtimePlan(nights: Night[], capMinutes: number | null = null): BedtimePlan {
  const recent = [...nights].sort((a, b) => b.end.getTime() - a.end.getTime()).slice(0, 14);
  const wakes = recent.map((n) => localMinutes(n.end)).sort((a, b) => a - b);
  const wakeMinutes = wakes.length > 0 ? wakes[Math.floor(wakes.length / 2)]! : DEFAULT_WAKE;
  const needMinutes = Math.round(recent[0]?.needMinutes ?? DEFAULT_NEED);
  const idealMinutes = (((wakeMinutes - needMinutes - LATENCY) % 1440) + 1440) % 1440;

  const beds = recent.map((n) => line(localMinutes(n.start))).sort((a, b) => a - b);
  const usual = beds.length > 0 ? beds[Math.floor(beds.length / 2)]! : null;
  let target = line(idealMinutes);
  if (usual !== null && usual - target >= 2 * STEP) target = Math.max(target, Math.floor((usual - STEP) / STEP) * STEP);
  if (capMinutes !== null) target = Math.min(target, line(capMinutes));
  return { wakeMinutes, needMinutes, bedMinutes: target % 1440, idealMinutes };
}

export type MessageKind = "bedtime" | "morning" | "commitments";

export interface Due {
  kind: MessageKind;
  /** The key that makes it once a day. An evening runs until 06:00. */
  day: string;
}

export function dueMessages(
  now: Date,
  input: { plan: BedtimePlan; lastWake: Date | null; sent: Set<string> },
): Due[] {
  const out: Due[] = [];
  const nowMin = localMinutes(now);

  const evening = localDay(new Date(now.getTime() - 6 * 3_600_000));
  const untilBed = (input.plan.bedMinutes - nowMin + 1440) % 1440;
  if (untilBed <= LEAD && !input.sent.has(`bedtime:${evening}`)) {
    out.push({ kind: "bedtime", day: evening });
  }

  // The morning note waits for the night to be scored (WHOOP takes a few
  // minutes after waking), and goes out at 10:00 regardless when there is no
  // WHOOP night to wait for. Never after 13:00: by then it is not a morning.
  const today = localDay(now);
  const wokeToday = input.lastWake !== null && localDay(input.lastWake) === today;
  const scored = wokeToday && now.getTime() - input.lastWake!.getTime() >= 20 * 60_000;
  if ((scored || nowMin >= 10 * 60) && nowMin < 13 * 60 && !input.sent.has(`morning:${today}`)) {
    out.push({ kind: "morning", day: today });
  }

  return out;
}

export function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
