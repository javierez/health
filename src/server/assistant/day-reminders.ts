import { ROUTINE_TITLE } from "~/lib/routines";
import { sinRayas } from "~/lib/sin-rayas";
import { itemKey } from "~/server/queries/today";
import { line } from "./plan";

/**
 * Reminders through the day (Javier, 20-oct-2026: «que me fuera enviando
 * notificaciones a lo largo del día recordándome cosas… 4, o más, depende de
 * si te contesto o no»). The morning note proposes them, each with its hour;
 * this keeps the ones that fit, and the reminders tick sends them unless the
 * row they are about is done. The model picks the hour and the words, the
 * code the limits: after the note, an hour apart, none in the hour before the
 * bedtime alert, and as many as `reminderCap` says.
 */
export interface Aviso {
  hora?: string;
  texto?: string;
  /** The title of the list item it is about, when it is about one. */
  de?: string;
}

export interface Planned {
  /** Its row of the day's list (`itemKey`), or null when it is about no row. */
  key: string | null;
  /** Local minutes. */
  minutes: number;
  body: string;
}

const GAP = 60;
/** Not in the 15 minutes after the note: it has just said it. */
const AFTER_NOTE = 15;
const LAST = 22 * 60 + 30;

function minutesOf(hora: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora?.trim() ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export function pickReminders(avisos: Aviso[], titles: string[], nowMinutes: number, bedMinutes: number, max: number): Planned[] {
  const until = Math.min(LAST, line(bedMinutes) - 60);
  const timed = avisos
    .flatMap((a) => {
      const minutes = minutesOf(a.hora);
      if (minutes === null || minutes < nowMinutes + AFTER_NOTE || minutes > until) return [];
      const title = titles.find((t) => t.trim().toLowerCase() === a.de?.trim().toLowerCase());
      // No hour fits it: it is asked after he trains (`~/server/agent/after-training`).
      if (title === ROUTINE_TITLE.entreno) return [];
      const text = a.texto?.trim() ? a.texto : title;
      if (!text) return [];
      // A template variable takes one line (`parseWritten`).
      const body = sinRayas(text).replace(/\s+/g, " ").trim().slice(0, 300);
      return [{ key: title ? itemKey(title) : null, minutes, body }];
    })
    .sort((a, b) => a.minutes - b.minutes);
  const out: Planned[] = [];
  for (const t of timed) {
    if (out.length === max) break;
    if (out.length === 0 || t.minutes - out[out.length - 1]!.minutes >= GAP) out.push(t);
  }
  return out;
}

/** He answered one when he wrote within two hours of it. */
const ANSWER_MS = 2 * 3_600_000;

/**
 * How many today, from the last week's: four to start, up to eight while he
 * answers them, two when he lets them go by.
 */
export function reminderCap(sent: Date[], inbound: Date[]): number {
  if (sent.length < 4) return 4;
  const answered = sent.filter((s) => inbound.some((i) => i > s && i.getTime() - s.getTime() <= ANSWER_MS)).length;
  const rate = answered / sent.length;
  return rate >= 0.8 ? 8 : rate >= 0.5 ? 6 : rate >= 0.2 ? 4 : 2;
}
