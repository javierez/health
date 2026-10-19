/**
 * Each time he goes to the toilet, how long and how it went. Javier, 18-oct-2026: «las
 * veces que voy al baño y cómo me siento… es importante en mi caso» (a urine
 * infection in March, prostatitis until April); «lo que sea… e incluso durante
 * cuánto tiempo». Told by WhatsApp, never typed; no card of its own, it is read
 * in «Datos» under «Médico» («no lo hagas visual»). Pure: the agent and «Datos»
 * share it.
 */
export const TOILET_SYMPTOMS = {
  burning: "escozor",
  urgency: "urgencia",
  pain: "dolor",
  blood: "sangre",
  incomplete: "no vacía del todo",
  weak: "chorro flojo",
} as const;
export type ToiletSymptom = keyof typeof TOILET_SYMPTOMS;

export const FEELS = { good: "bien", meh: "regular", bad: "mal" } as const;
export type Feel = keyof typeof FEELS;

export interface ToiletTime {
  toilet: "pee" | "poo";
  feel?: Feel;
  /** Poo only: the Bristol scale, 1 hard lumps · 4 normal · 7 liquid. */
  bristol?: number;
  symptoms?: ToiletSymptom[];
  /** How long it took, when he says it. */
  durationMin?: number;
  /** Local minutes since midnight. */
  minutes: number;
}

/** Midnight to six: a pee then is one that woke him. */
export const atNight = (minutes: number) => minutes < 6 * 60;

/** «tipo 4, bien» · «escozor, urgencia»: what one time was. */
export function detail(t: ToiletTime): string {
  const parts = [
    ...(t.bristol ? [`tipo ${t.bristol}`] : []),
    ...(t.durationMin ? [`${t.durationMin} min`] : []),
    ...(t.symptoms ?? []).map((s) => TOILET_SYMPTOMS[s]),
  ];
  if (t.feel && (t.feel !== "good" || parts.length === 0)) parts.push(FEELS[t.feel]);
  return parts.join(", ");
}

const times = (n: number) => (n === 1 ? "1 vez" : `${n} veces`);

/** «escozor 2 veces, sangre 1 vez»: every symptom with how often. */
function symptomCounts(list: ToiletTime[]): string[] {
  const count = new Map<ToiletSymptom, number>();
  for (const t of list) for (const s of t.symptoms ?? []) count.set(s, (count.get(s) ?? 0) + 1);
  return [...count].map(([s, n]) => `${TOILET_SYMPTOMS[s]} ${times(n)}`);
}

/** «6 pis (2 de noche) · 1 caca (tipo 4) · escozor 2 veces»: one day. */
export function dayLine(list: ToiletTime[]): string {
  const pee = list.filter((t) => t.toilet === "pee");
  const poo = list.filter((t) => t.toilet === "poo");
  const night = pee.filter((t) => atNight(t.minutes)).length;
  const types = poo.flatMap((t) => (t.bristol ? [t.bristol] : []));
  return [
    pee.length > 0 ? `${pee.length} pis${night > 0 ? ` (${night} de noche)` : ""}` : null,
    poo.length > 0
      ? `${poo.length} ${poo.length === 1 ? "caca" : "cacas"}${types.length > 0 ? ` (${types.length === 1 ? "tipo" : "tipos"} ${types.join(", ")})` : ""}`
      : null,
    ...symptomCounts(list),
  ]
    .filter(Boolean)
    .join(" · ");
}
