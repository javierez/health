import { addDays } from "~/lib/day";
import type { Session } from "~/server/training/summary";

/**
 * «Sesiones» in Entrenos, tidied (Javier, 22-oct-2026: «más organizadita…
 * y bonita»): by month, one line per session with its name and what it took.
 * Pure, so the card only paints.
 */
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
export const weekday = (day: string) => WEEKDAYS[weekdayOf(day)]!;
const monday = (day: string) => addDays(day, -((weekdayOf(day) + 6) % 7));
const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** «41 min», «1 h 13 min», «2 h». */
export function hours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export interface Month {
  label: string;
  /** «4 días · 1 h 13 min». */
  meta: string;
  sessions: Session[];
}

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/**
 * Newest month first: «Noviembre», then «Octubre», and «Diciembre 2025» once
 * the year changes. By month since all the year is there (Javier,
 * 14-nov-2026: «todas las sesiones»).
 */
export function monthsOf(sessions: Session[], today: string): Month[] {
  const months = new Map<string, Session[]>();
  for (const s of sessions) months.set(s.day.slice(0, 7), [...(months.get(s.day.slice(0, 7)) ?? []), s]);
  return [...months.entries()].map(([month, list]) => {
    // The month's time only when every session has its own: «7 días · 50 min» read as a month of 50 minutes.
    const minutes = list.every((s) => s.minutes) ? list.reduce((n, s) => n + s.minutes!, 0) : 0;
    const days = new Set(list.map((s) => s.day)).size;
    const name = MONTH_NAMES[Number(month.slice(5, 7)) - 1]!;
    return {
      label: month.slice(0, 4) === today.slice(0, 4) ? name : `${name} ${month.slice(0, 4)}`,
      meta: [`${days} ${days === 1 ? "día" : "días"}`, minutes > 0 ? hours(minutes) : null].filter(Boolean).join(" · "),
      sessions: list,
    };
  });
}

/** Days trained since Monday, today included: the same week as «Sesiones». */
export function thisWeek(sessions: Session[], today: string): number {
  return new Set(sessions.filter((s) => s.day >= monday(today) && s.day <= today).map((s) => s.day)).size;
}

const exercisesOf = (s: Session) => s.lines.filter((l) => !l.sport);
const sportsOf = (s: Session) => s.lines.filter((l) => l.sport);

/** Its routine, else «Gimnasio» with exercises, else the sports by name, else what he said. */
export function titleOf(s: Session): string {
  if (s.routine) return s.routine.name;
  if (exercisesOf(s).length > 0) return "Gimnasio";
  const sports = sportsOf(s);
  if (sports.length > 0) return sports.map((l) => l.name).join(" y ");
  return s.said[0] ?? "Entreno";
}

/** «Completa · 41 min», «4 de 7 ejercicios», «3 ejercicios · Correr 6 km», «6 km · 30 min». */
export function subOf(s: Session): string {
  const exercises = exercisesOf(s).length;
  const sports = sportsOf(s);
  if (exercises === 0 && !s.routine) return sports.map((l) => l.text).filter(Boolean).join(" · ");
  return [
    s.routine ? (s.routine.done >= s.routine.of ? "Completa" : `${s.routine.done} de ${s.routine.of} ejercicios`) : `${exercises} ${exercises === 1 ? "ejercicio" : "ejercicios"}`,
    ...sports.map((l) => `${l.name} ${l.text}`.trim()),
    s.minutes && sports.length === 0 ? hours(s.minutes) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The first exercise of the routine not done yet: «Ahora» while he trains. */
export function nextOf(routine: string[], s: Session): string | null {
  const did = new Set(s.lines.map((l) => plain(l.name)));
  return routine.find((n) => !did.has(plain(n))) ?? null;
}
