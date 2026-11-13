import { addDays, dayLong, daysBetween, localDay } from "~/lib/day";

/**
 * What is coming in the next week, each line with its day worked out.
 * «Consulta el lunes a las 15:45», heard on Friday 23-oct-2026, is «Hoy» on
 * Monday the 26th: the model was given the bare dates, missed it, and that
 * morning's note never said there was a consultation in the afternoon. The
 * calendar is code's; the model only reads «Hoy».
 */
export interface Heard {
  at: Date;
  summary: string;
  /** Already dated (an entry of his file with its day): nothing to read off the words. */
  day?: string | null;
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** Only what reads like somewhere to be: «el escáner del lunes» was last Monday. */
const PLAN = /\b(cita|consulta|prueba|revision|ecograf|analitica|operacion|volante|acudir|ir a|llevar|viaj)/;
const AHEAD = 7;

/** Accents off, so the patterns stay plain ASCII and `\b` means what it says. */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** The days a line names, counted from the day it was said: «el martes», «mañana», «el 3 de noviembre». */
export function daysNamed(text: string, said: string): string[] {
  const t = fold(text);
  const out: string[] = [];
  const weekday = new Date(`${said}T12:00:00Z`).getUTCDay();
  for (const m of t.matchAll(/\b(?:el|este|el proximo|(?:cita|consulta|prueba|revision) del)\s+(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b( de la (?:semana que viene|proxima semana))?/g)) {
    const target = WEEKDAYS.indexOf(m[1]!);
    // «El jueves de la semana que viene» said on Thursday 5-nov-2026 is the 12th, not that same day: next week's.
    if (m[2]) out.push(addDays(said, 7 - ((weekday + 6) % 7) + ((target + 6) % 7)));
    // Always ahead: «el lunes» said on a Monday is the next one.
    else out.push(addDays(said, ((target - weekday + 6) % 7) + 1));
  }
  if (/\bhoy\b/.test(t)) out.push(said);
  if (/\bpasado manana\b/.test(t)) out.push(addDays(said, 2));
  // «por la mañana», «esta mañana» are a time of day, not tomorrow.
  else if (/(?<!\bla |\besta )\bmanana\b/.test(t)) out.push(addDays(said, 1));
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2}) de (${MONTHS.join("|")})\\b`, "g"))) {
    const day = `${said.slice(0, 4)}-${String(MONTHS.indexOf(m[2]!) + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    out.push(day < said ? `${Number(said.slice(0, 4)) + 1}${day.slice(4)}` : day);
  }
  return [...new Set(out)];
}

const label = (day: string, today: string) =>
  day === today ? `Hoy (${dayLong(day)})` : day === addDays(today, 1) ? `Mañana (${dayLong(day)})` : dayLong(day);

/** One line per thing, soonest first, from today to a week ahead. */
export function upcoming(heard: Heard[], today: string): string[] {
  const out = new Map<string, { day: string; at: number; line: string }>();
  for (const h of heard) {
    const days = h.day ? [h.day] : PLAN.test(fold(h.summary)) ? daysNamed(h.summary, localDay(h.at)) : [];
    for (const day of days) {
      const ahead = daysBetween(today, day);
      if (ahead >= 0 && ahead <= AHEAD) out.set(`${day} ${h.summary}`, { day, at: h.at.getTime(), line: h.summary });
    }
  }
  return [...out.values()]
    .sort((a, b) => a.day.localeCompare(b.day) || a.at - b.at)
    .map((u) => `- ${label(u.day, today)}: ${u.line}`);
}
