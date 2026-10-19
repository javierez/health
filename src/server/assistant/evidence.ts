/**
 * Proactive advice, each line backed by a guideline or a paper the scientific
 * community recognises (checked 16-oct-2026). Pure and free: no model decides
 * whether he slept less than 7 hours; his data does. The same list goes to the
 * morning note's model as `EVIDENCE_LINES`, so what it writes stands on the
 * same ground.
 */
import { FIBER_TARGET, proteinTarget } from "~/lib/food";

export interface Source {
  short: string;
  url: string;
}

export const SOURCES = {
  aasm: { short: "AASM y SRS, J Clin Sleep Med 2015", url: "https://aasm.org/resources/pdf/adultsleepdurationconsensus.pdf" },
  windred: { short: "Windred et al., Sleep 2024", url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10782489/" },
  drake: { short: "Drake et al., J Clin Sleep Med 2013", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3805807/" },
  ebrahim: { short: "Ebrahim et al., Alcohol Clin Exp Res 2013", url: "https://doi.org/10.1111/acer.12006" },
  morton: { short: "Morton et al., Br J Sports Med 2018", url: "https://pubmed.ncbi.nlm.nih.gov/28698222/" },
  who: { short: "OMS, Br J Sports Med 2020", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7719906/" },
  reynolds: { short: "Reynolds et al., Lancet 2019", url: "https://doi.org/10.1016/S0140-6736(18)31809-9" },
} satisfies Record<string, Source>;

/** What the morning note's model is told the evidence says. */
export const EVIDENCE_LINES = [
  `- Dormir 7 h o más; por debajo, de forma habitual, más peso, tensión, depresión y mortalidad (${SOURCES.aasm.short}).`,
  `- Acostarse y levantarse a la misma hora pesa más que la duración en la mortalidad (${SOURCES.windred.short}).`,
  `- Cafeína 6 h antes de dormir quita más de 1 h de sueño sin que uno lo note (${SOURCES.drake.short}).`,
  `- El alcohol duerme antes pero rompe la segunda mitad de la noche y retrasa el REM (${SOURCES.ebrahim.short}).`,
  `- Con entreno de fuerza, la proteína suma hasta ~1,6 g/kg/día; por encima, nada más (${SOURCES.morton.short}).`,
  `- 150 a 300 min/semana de cardio moderado (o 75 a 150 intenso) y fuerza de todo el cuerpo 2 o más días (${SOURCES.who.short}).`,
  `- 25 a 29 g de fibra al día (legumbre, verdura, fruta, integral): 15 a 30 % menos mortalidad (${SOURCES.reynolds.short}).`,
].join("\n");

export interface AdviceInput {
  /** Minutes since local midnight. */
  nowMin: number;
  /** Tonight's planned bedtime, minutes since midnight. */
  bedMinutes: number;
  /** Last nights, newest first: bedtime (minutes since midnight) and minutes asleep. */
  nights: { bed: number; asleep: number | null }[];
  /** Drank caffeine on any of the last 7 days. */
  drinksCaffeine: boolean;
  /** Today's latest caffeine, minutes since midnight. */
  lastCaffeine: number | null;
  /** Days with alcohol among the last 3. */
  alcoholDays: number;
  /** Protein estimated from today's meal photos, null when none says. */
  proteinToday: number | null;
  /** Fibre from today's meals told food by food, null when none was. */
  fiberToday?: number | null;
  weightKg: number;
  strengthWeek: number;
  cardioMinutesWeek: number;
  /** 1 Monday … 7 Sunday. */
  weekday: number;
  /** A commitment already pushes this, so no second row for it. */
  covered: { strength: boolean; cardio: boolean };
  /** His own Friday and Saturday nights (`~/server/insights/findings`), when they clearly cost him. */
  weekendNights?: { recovery: number; others: number; nights: number } | null;
}

export interface Advice {
  key: string;
  /** Something to do, or something to leave: the panel lists them apart. */
  verb: "haz" | "evita";
  area: "sleep" | "training" | "food";
  title: string;
  detail: string;
  source: Source;
}

const hhmm = (m: number) => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};
const hours = (m: number) => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")}`;

/** Bedtimes around midnight on one line: 23:30 and 00:30 are an hour apart, not 23. */
export function bedSpread(beds: number[]): number {
  if (beds.length < 3) return 0;
  const line = beds.map((b) => (b < 12 * 60 ? b + 1440 : b));
  const mean = line.reduce((a, b) => a + b, 0) / line.length;
  return Math.round(Math.sqrt(line.reduce((a, b) => a + (b - mean) ** 2, 0) / line.length));
}

/** At most three, most pressing first. */
export function advise(d: AdviceInput): Advice[] {
  const out: Advice[] = [];
  const cutoff = (d.bedMinutes - 360 + 1440) % 1440;
  const late = d.lastCaffeine !== null && (d.lastCaffeine - cutoff + 1440) % 1440 < 720;

  if (late) {
    out.push({
      key: "ev-caffeine-late",
      verb: "evita",
      area: "sleep",
      title: "Otro café hoy",
      detail: `El de las ${hhmm(d.lastCaffeine!)} cae a menos de 6 h de tu hora de cama (${hhmm(d.bedMinutes)}): puede quitarte más de 1 h de sueño sin que lo notes.`,
      source: SOURCES.drake,
    });
  }
  if (d.alcoholDays > 0) {
    out.push({
      key: "ev-alcohol",
      verb: "evita",
      area: "sleep",
      title: "Alcohol hoy",
      detail: `Bebiste ${d.alcoholDays === 1 ? "un día" : `${d.alcoholDays} días`} de los 3 últimos. Duermes antes, pero la segunda mitad de la noche se rompe y llega menos REM.`,
      source: SOURCES.ebrahim,
    });
  }
  // His own weekend, on the evening it can still change: Friday or Saturday.
  const w = d.weekendNights;
  if (w && d.alcoholDays === 0 && (d.weekday === 5 || d.weekday === 6)) {
    out.push({
      key: "ev-weekend",
      verb: "evita",
      area: "sleep",
      title: "Alcohol esta noche",
      detail: `Tus ${w.nights} noches de viernes y sábado: recuperas ${w.recovery} % en vez de ${w.others} %. El alcohol duerme antes pero rompe la segunda mitad de la noche.`,
      source: SOURCES.ebrahim,
    });
  }
  const slept = d.nights.slice(0, 7).flatMap((n) => (n.asleep === null ? [] : [n.asleep]));
  const meanSleep = slept.length >= 3 ? slept.reduce((a, b) => a + b, 0) / slept.length : null;
  if (meanSleep !== null && meanSleep < 420) {
    out.push({
      key: "ev-sleep-short",
      verb: "haz",
      area: "sleep",
      title: "Duerme 7 h o más",
      detail: `Llevas ${hours(meanSleep)} de media en ${slept.length} noches. Por debajo de 7 h de forma habitual sube el riesgo de peso, tensión y depresión.`,
      source: SOURCES.aasm,
    });
  }
  const spread = bedSpread(d.nights.slice(0, 7).map((n) => n.bed));
  if (spread > 45) {
    out.push({
      key: "ev-sleep-regular",
      verb: "haz",
      area: "sleep",
      // The hour itself is the bed row's; this one is about keeping it.
      title: "La misma hora de cama cada noche, también el finde",
      detail: `Tu hora de acostarte varía ±${spread} min. Dormir a horas regulares predice la mortalidad mejor que dormir más.`,
      source: SOURCES.windred,
    });
  }
  const protein = proteinTarget(d.weightKg);
  if (d.proteinToday !== null && d.nowMin >= 16 * 60 && d.proteinToday < protein * 0.75) {
    out.push({
      key: "ev-protein",
      verb: "haz",
      area: "food",
      title: `Te faltan ~${protein - Math.round(d.proteinToday)} g de proteína hoy`,
      detail: `Llevas ~${Math.round(d.proteinToday)} g de ${protein} (1,6 g por kg). Con fuerza, hasta ahí suma músculo; más allá, no.`,
      source: SOURCES.morton,
    });
  }
  if (!d.covered.strength && d.weekday >= 4 && d.strengthWeek < 2) {
    out.push({
      key: "ev-strength",
      verb: "haz",
      area: "training",
      title: d.strengthWeek === 0 ? "Dos sesiones de fuerza antes del domingo" : "Una sesión de fuerza más antes del domingo",
      detail: `Llevas ${d.strengthWeek} esta semana. La OMS pide fuerza de todo el cuerpo 2 o más días.`,
      source: SOURCES.who,
    });
  }
  if (!d.covered.cardio && d.weekday >= 5 && d.cardioMinutesWeek < 150) {
    out.push({
      key: "ev-cardio",
      verb: "haz",
      area: "training",
      title: `${150 - d.cardioMinutesWeek} min de cardio antes del domingo`,
      detail: `Llevas ${d.cardioMinutesWeek} de 150 esta semana: a paso que puedas hablar, pero no cantar.`,
      source: SOURCES.who,
    });
  }
  if (!late && d.drinksCaffeine && d.nowMin < cutoff) {
    out.push({
      key: "ev-caffeine-cutoff",
      verb: "evita",
      area: "sleep",
      title: `Café después de las ${hhmm(cutoff)}`,
      detail: `6 h antes de tu hora de cama (${hhmm(d.bedMinutes)}). Más tarde quita sueño aunque te duermas igual.`,
      source: SOURCES.drake,
    });
  }
  // His own count from the afternoon on; before that, or untold, the general line.
  const fibre = d.fiberToday ?? null;
  const counted = fibre !== null && d.nowMin >= 16 * 60;
  if (fibre === null || fibre < FIBER_TARGET) {
    out.push({
      key: "ev-fibre",
      verb: "haz",
      area: "food",
      title: counted ? `Te faltan ~${FIBER_TARGET - Math.round(fibre)} g de fibra hoy` : "Legumbre, verdura o integral en cada comida",
      detail: counted
        ? `Llevas ~${Math.round(fibre)} g de ${FIBER_TARGET}: legumbre, verdura, fruta o integral. Con 25-29 g al día, 15 a 30 % menos mortalidad.`
        : "Para llegar a 25-29 g de fibra al día: con eso, 15 a 30 % menos mortalidad y menos diabetes y cáncer de colon.",
      source: SOURCES.reynolds,
    });
  }
  return out.slice(0, 3);
}
