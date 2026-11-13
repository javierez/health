import { addDays } from "~/lib/day";
import type { Session } from "~/server/training/summary";

/**
 * «Sesiones» in Entrenos, tidied (Javier, 22-oct-2026: «más organizadita…
 * y bonita»): by week, one line per session with its name and what it took.
 * Pure, so the card only paints.
 */
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
export const weekday = (day: string) => WEEKDAYS[weekdayOf(day)]!;
const monday = (day: string) => addDays(day, -((weekdayOf(day) + 6) % 7));
const short = (day: string) => `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** «41 min», «1 h 13 min», «2 h». */
export function hours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export interface Week {
  label: string;
  /** «4 días · 1 h 13 min». */
  meta: string;
  sessions: Session[];
}

/** Newest week first, Monday to Sunday: «Esta semana», then «13 a 19 oct». */
export function weeksOf(sessions: Session[], today: string): Week[] {
  const weeks = new Map<string, Session[]>();
  for (const s of sessions) weeks.set(monday(s.day), [...(weeks.get(monday(s.day)) ?? []), s]);
  return [...weeks.entries()].map(([start, list]) => {
    const end = addDays(start, 6);
    // The week's time only when every session has its own: «7 días · 50 min» read as a week of 50 minutes.
    const minutes = list.every((s) => s.minutes) ? list.reduce((n, s) => n + s.minutes!, 0) : 0;
    const days = new Set(list.map((s) => s.day)).size;
    return {
      label: start === monday(today) ? "Esta semana" : start.slice(5, 7) === end.slice(5, 7) ? `${Number(start.slice(8))} a ${short(end)}` : `${short(start)} a ${short(end)}`,
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
