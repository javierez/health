import { daysBetween } from "~/lib/day";
import type { Zone } from "~/lib/exercises";
import type { ZoneWeek } from "./summary";

/**
 * What to train now, from what is loaded and what is ready (Javier,
 * 18-oct-2026: «¿qué me toca ahora?… más que verlo a pasado»). Of the three
 * big groups, the one whose muscles are all ready and that waited longest;
 * if none is, rest. The body map already shows what is loaded, so the line
 * under it is short. Pure.
 */
export interface Next {
  /** «Hoy toca pierna» · «Mañana, descanso». */
  title: string;
  /** «Última vez hace 6 días» · «Camina o haz cardio suave». */
  detail: string;
}

/** Above this a muscle is loaded; under `READY` it is ready (`ZoneWeek.fatigue`). */
export const LOADED = 5;
export const READY = 1;

const GROUPS: { name: string; zones: Zone[] }[] = [
  { name: "pierna", zones: ["cuadriceps", "isquios", "gluteos"] },
  { name: "pecho y hombros", zones: ["pecho", "hombros", "triceps"] },
  { name: "espalda y bíceps", zones: ["espalda", "biceps", "trapecio"] },
];

/** `when` is «Mañana» once today's session is in: `zones` then carry tomorrow's fatigue. */
export function nextTraining(zones: ZoneWeek[], today: string, when: "Hoy" | "Mañana" = "Hoy"): Next {
  const of = (z: Zone) => zones.find((x) => x.zone === z);
  const ready = GROUPS.flatMap((g) => {
    if (!g.zones.every((z) => (of(z)?.fatigue ?? 0) < READY)) return [];
    const last = g.zones.flatMap((z) => of(z)?.last ?? []).sort().at(-1);
    return [{ ...g, ago: last ? daysBetween(last, today) : null }];
  });
  // Never trained waits longest; then the oldest.
  const pick = ready.sort((a, b) => (b.ago ?? Infinity) - (a.ago ?? Infinity))[0];
  if (!pick) return { title: `${when}, descanso`, detail: "Camina o haz cardio suave" };
  const ago = pick.ago === null ? "Sin entrenar aún" : pick.ago === 1 ? "Última vez ayer" : `Última vez hace ${pick.ago} días`;
  return { title: `${when} toca ${pick.name}`, detail: ago };
}
