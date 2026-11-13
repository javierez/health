import { addDays } from "~/lib/day";
import type { Day as BandDay } from "~/lib/whoop/days";
import { healthspan, paceOfAging, pillarValues, PILLARS, WINDOW, weeklyDeltas } from "~/lib/whoop/healthspan";
import { cardioMinutes, exerciseWeeks, regularity, socialWeeks, stepDays, STEP_GOAL, vo2Months, type Spoken } from "~/lib/whoop/longevity";
import { mean, METRICS, values, type MetricKey } from "~/lib/whoop/stats";

import type { Finding, Findings } from "./findings";
import { OUTCOME_KEYS, OUTCOMES } from "./outcomes";

/**
 * Everything health measures, as the lines the interpreter reads once a week
 * (`interpret.ts`): what the engine found about each outcome, how his body
 * moved in the last month, the five longevity numbers, Healthspan and his
 * weeks. Pure and free: the model only draws the conclusions.
 */
export interface ReadingInput {
  today: string;
  found: Findings;
  band: { days: BandDay[]; maxHr: number | null; age: number | null; spoken: Spoken[] };
  /** `progressLines`: sleep, training, weight, code and calls by week. */
  progress: string[];
}

const n = (v: number, digits = 0) => v.toLocaleString("es-ES", { maximumFractionDigits: digits });
const hm = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, "0")} h`;

/** The body metrics worth a conclusion; the rest repeat these. */
const SHIFTS: MetricKey[] = ["recovery", "hrv", "rhr", "resp", "spo2", "skinTemp", "sleepHours", "hoursVsNeed", "consistency", "efficiency", "restorative", "strain", "steps", "stress"];

function findingLine(tag: string, f: Finding) {
  return `- ${tag}${f.title}: ${f.big}${OUTCOMES[f.outcome].unit} (${f.sure ? "seguro" : "probable"}, ${f.nights} noches). ${f.detail}`;
}

function outcomeLines(found: Findings) {
  return OUTCOME_KEYS.flatMap((o) => {
    const r = found.by[o];
    if (r.good.length + r.bad.length + r.unclear.length + r.neutral.length === 0) return [];
    return [
      `\n${OUTCOMES[o].label} (${OUTCOMES[o].axis}; importa a partir de ${n(OUTCOMES[o].gap, 1)}${OUTCOMES[o].unit}):`,
      ...r.good.map((f) => findingLine("Le sienta bien: ", f)),
      ...r.bad.map((f) => findingLine("Le sienta mal: ", f)),
      ...r.unclear.map((f) => findingLine("Por aclarar (grande pero con ruido): ", f)),
      ...(r.neutral.length > 0 ? [`- No le afecta: ${r.neutral.map((f) => f.title).join("; ")}.`] : []),
    ];
  });
}

/** The last 30 days against the 90 before them. */
function shiftLines(days: BandDay[], today: string) {
  return SHIFTS.flatMap((k) => {
    const now = values(days, k, addDays(today, -29), today);
    const before = values(days, k, addDays(today, -119), addDays(today, -30));
    if (now.length < 10 || before.length < 10) return [];
    const m = METRICS[k];
    const digits = Math.abs(mean(now)!) < 10 ? 1 : 0;
    return [`- ${m.label}: ${n(mean(now)!, digits)}${m.unit ? ` ${m.unit}` : ""} (antes ${n(mean(before)!, digits)})`];
  });
}

function longevityLines({ days, maxHr, spoken }: ReadingInput["band"], today: string) {
  const out: string[] = [];
  const vo2 = vo2Months(days, maxHr);
  const last = vo2.at(-1);
  if (last) out.push(`- VO₂máx estimado (pulso máximo / en reposo): ${n(last.low)} a ${n(last.high)} ml/kg/min en ${last.month}${vo2.length > 6 ? `; hace 6 meses ${n(vo2.at(-7)!.high)}` : ""}.`);
  const weeks = exerciseWeeks(days, today, 8);
  const lastWeek = weeks.at(-1)!;
  out.push(
    `- Cardio (OMS: 150 min a la semana, zonas 4-5 cuentan doble): ${cardioMinutes(lastWeek)} min la última semana; media de 8 semanas ${n(mean(weeks.map(cardioMinutes))!)}. Fuerza: ${lastWeek.strength} min la última semana, media ${n(mean(weeks.map((w) => w.strength))!)}.`,
  );
  const steps = stepDays(days, today);
  if (steps.length > 0) out.push(`- Pasos: media de ${n(mean(steps.map((s) => s.steps))!)} al día en 30 días; ${steps.filter((s) => s.steps >= STEP_GOAL).length} de ${steps.length} días por encima de ${n(STEP_GOAL)}.`);
  const social = socialWeeks(spoken, today);
  if (social.length > 0) {
    const avg = (k: "family" | "friend" | "work") => hm(mean(social.map((w) => w.hours[k]))!);
    out.push(`- Tiempo hablando con gente (Pocket, media de ${social.length} semanas): pareja y familia ${avg("family")}, amigos ${avg("friend")}, trabajo ${avg("work")} a la semana.`);
  }
  const reg = regularity(days, today);
  if (reg.sd !== null) out.push(`- Regularidad del sueño: su hora de acostarse y levantarse varía ±${n(reg.sd)} min (por encima de 30 empieza a costar salud, Windred 2024).`);
  return out;
}

function healthspanLines({ days, maxHr, age }: ReadingInput["band"], today: string) {
  const h = healthspan(pillarValues(days, today, WINDOW, maxHr), age);
  if (!h) return [];
  const pace = paceOfAging(weeklyDeltas(days, today, age, maxHr));
  const rows = [...h.contributions].sort((a, b) => b.years - a.years).map((c) => {
    const p = PILLARS.find((x) => x.key === c.key)!;
    return `${p.label} ${n(c.value, 1)} ${p.unit} (${c.years > 0 ? "+" : ""}${n(c.years, 1)} años)`;
  });
  return [
    `- Healthspan: ${h.delta <= 0 ? `${n(-h.delta, 1)} años más joven` : `${n(h.delta, 1)} años mayor`} que el adulto de referencia${pace === null ? "" : `; ritmo de envejecimiento ${n(pace, 2)}x`}. Lo que suma y resta, de peor a mejor: ${rows.join("; ")}.`,
  ];
}

/** A heading only over lines: an empty one reads as «nothing changed». */
const section = (title: string, lines: string[]) => (lines.length > 0 ? [title, ...lines] : []);

export function readingContext(input: ReadingInput): string {
  const { today, found, band, progress } = input;
  return [
    `Hoy es ${today}. ${found.nights} mañanas medidas, ${found.tests} comparaciones hechas.`,
    "\nQué le afecta, del motor estadístico (sus días partidos en dos y comparados al día siguiente, a la misma hora de acostarse; «seguro» es menos de un 5 % de falsas alarmas, «probable» menos de un 20 %):",
    ...outcomeLines(found),
    `\nSin datos suficientes aún: ${found.waiting.join("; ") || "nada"}.`,
    ...section("\nCómo se ha movido su cuerpo, media de los 30 últimos días (y la de los 90 anteriores):", shiftLines(band.days, today)),
    "\nLongevidad, lo que más evidencia tiene:",
    ...longevityLines(band, today),
    ...healthspanLines(band, today),
    "\nSus semanas:",
    ...progress,
  ].join("\n");
}
