import { addDays } from "~/lib/day";
import { kindKey } from "~/lib/renders";
import { SOURCES } from "~/server/assistant/evidence";

import { firstDaysOf, high, num, thirds, type Candidate } from "./candidates";
import type { Day } from "./days";

/**
 * What the band and the Pocket added on 21-oct-2026 (Javier: «mejora las
 * correlaciones con estas nuevas variables»): bedtime regularity, intensity,
 * the week's cardio, steps, time with his people and his pulse's stress.
 * The same splits as `candidates.ts`, kept apart so that file stops growing.
 * And each supplement before and since he started it.
 */
export function bandCandidates(days: Day[]): Candidate[] {
  const out: Candidate[] = [];
  out.push({
    key: "bed-regular",
    controllable: true,
    title: "Acostarte a tu hora de siempre",
    side: (d) => (d.bedShift === null ? null : d.bedShift <= 30 ? true : d.bedShift >= 60 ? false : null),
    labels: ["A ±30 min de tu hora", "Más de 1 h fuera"],
    adjust: false,
    good: { verb: "haz", action: "a la cama a tu hora de siempre, también el fin de semana" },
    bad: { verb: "evita", action: "obligarte a una hora fija si no tienes sueño" },
    source: SOURCES.windred,
  });
  out.push({
    key: "vigorous",
    controllable: true,
    title: "Entrenar a tope (zonas 4-5)",
    side: (d) => (!d.trained || d.vigorousMin === null ? null : d.vigorousMin >= 10 ? true : d.vigorousMin === 0 ? false : null),
    labels: ["10 min o más en zonas 4-5", "Entreno sin zonas 4-5"],
    adjust: true,
    good: { verb: "haz", action: "10 min en zonas 4-5 dos veces por semana" },
    bad: { verb: "evita", action: "las zonas 4-5 la víspera de un día importante" },
    source: SOURCES.who,
  });
  out.push({
    key: "active-week",
    controllable: true,
    title: "Semana con 150 min de cardio",
    side: (d) => (d.activeWeek === null ? null : d.activeWeek >= 150 ? true : d.activeWeek < 75 ? false : null),
    labels: ["150 min o más en 7 días", "Menos de 75"],
    adjust: true,
    good: { verb: "haz", action: "llega a 150 min de cardio a la semana" },
    bad: { verb: "evita", action: "meter todo el cardio de la semana en dos días" },
    source: SOURCES.who,
  });
  const steps = thirds(days, (d) => d.steps);
  if (steps) {
    out.push({
      key: "steps-high",
      controllable: true,
      title: "Días de muchos pasos",
      side: high((d) => d.steps, steps),
      labels: [`Más de ${num(steps[1])} pasos`, `Hasta ${num(steps[0])}`],
      adjust: true,
      good: { verb: "haz", action: `pasa de ${num(steps[1])} pasos al día` },
      bad: { verb: "evita", action: "las caminatas largas por la noche" },
    });
  }
  out.push({
    key: "family",
    controllable: true,
    title: "Rato con tu pareja o tu familia",
    side: (d) => (d.family === null ? null : d.family >= 30 ? true : d.family === 0 ? false : null),
    labels: ["30 min o más", "Nada"],
    adjust: true,
    good: { verb: "haz", action: "media hora con los tuyos, sin móvil" },
    bad: { verb: "evita", action: "las conversaciones largas en casa justo antes de dormir" },
  });
  out.push({
    key: "friends",
    controllable: true,
    title: "Rato con amigos",
    side: (d) => (d.friends === null ? null : d.friends >= 30 ? true : d.friends === 0 ? false : null),
    labels: ["30 min o más", "Nada"],
    adjust: true,
    good: { verb: "haz", action: "queda con un amigo esta semana" },
    bad: { verb: "evita", action: "alargar los planes con amigos entre semana" },
  });
  // What his pulse says about the day: it happens to him, so it only goes with his nights.
  const stress = thirds(days, (d) => d.stress);
  if (stress) {
    out.push({
      key: "stress-high",
      title: "Días de mucho estrés (pulso)",
      side: high((d) => d.stress, stress),
      labels: [`Estrés de más de ${stress[1].toFixed(1)}`, `Hasta ${stress[0].toFixed(1)}`],
      adjust: true,
      good: { verb: "haz", action: "lo que haces esos días" },
      bad: { verb: "haz", action: "los días de estrés, 10 min de respirar lento antes de cenar" },
    });
  }
  out.push(...sinceCandidates(days));
  return out;
}

/** Before: the six weeks before the first day. Since: from a week in, when it has had time to work (creatine takes weeks). */
export const BEFORE_DAYS = 42;
export const SETTLE_DAYS = 7;

/**
 * What he takes every day has no days without it to compare: his weeks
 * before against his weeks since (Javier, 21-oct-2026: «cómo estoy antes
 * comparado con cómo estoy después de tomármelo»). Weaker than days with and
 * without, since everything else moved too, and the title says so.
 */
export function sinceCandidates(days: Day[]): Candidate[] {
  return [...firstDaysOf(days, (d) => d.products)].map(([name, first]) => {
    const from = addDays(first, SETTLE_DAYS);
    const before = addDays(first, -BEFORE_DAYS);
    return {
      key: `since-${kindKey(name)}`,
      controllable: true,
      title: `Desde que tomas ${name} (antes y después)`,
      side: (d: Day) => (d.day >= from ? (d.products.includes(name) ? true : null) : d.day >= before && d.day < first ? false : null),
      labels: ["Desde que lo tomas", "Las 6 semanas antes"] as [string, string],
      adjust: true,
      good: { verb: "haz" as const, action: `sigue con ${name}` },
      bad: { verb: "evita" as const, action: `${name} dos semanas y lo comparamos` },
    };
  });
}
