/**
 * The demo copy's data, invented from nothing (Javier, 21-oct-2026: Gonzalo
 * shows the app to someone, and none of his own data may be in it). 150 days
 * of WHOOP, 45 of meals, training and mood, the supplement protocol, a few
 * habits, a medical file with nothing real in it, a morning note and a weekly
 * reading written by hand, so the demo spends nothing on AI to look alive.
 * The patterns are built in on purpose (late nights and alcohol cost
 * recovery, the gym days lift it) so «Cómo te afecta» has something to find.
 *
 * Wipes and refills the demo database. Never his: it refuses a database with
 * his WHOOP user in it. Re-run it to bring the dates up to today.
 *
 *   DATABASE_URL=<demo> DEMO_MODE=1 pnpm tsx scripts/sembrar-demo.ts          # dry-run
 *   DATABASE_URL=<demo> DEMO_MODE=1 pnpm tsx scripts/sembrar-demo.ts --write
 */
import { sql } from "drizzle-orm";

import { db } from "~/db";
import {
  assistantMessages,
  chatMessages,
  checks,
  commitments,
  facts,
  medical,
  productUses,
  products,
  syncState,
  whoopRecords,
  type FactData,
  type ProductInfo,
} from "~/db/schema";
import { addDays, fromLocal, localDay } from "~/lib/day";
import type { Food } from "~/lib/food";

if (process.env.DEMO_MODE !== "1") throw new Error("Solo con DEMO_MODE=1, contra la base de la demo.");
const [his] = await db.execute<{ n: number }>(sql`select count(*)::int as n from whoop_records where raw->>'user_id' = '32175908'`);
if ((his?.n ?? 0) > 0) throw new Error("Esta base tiene los datos de Javier: no es la de la demo.");

const write = process.argv.includes("--write");
const today = localDay(new Date());
const DAYS = 150;
const FACT_DAYS = 45;

// A fixed wobble: the same demo every run.
let seed = 11;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
const noise = (size: number) => (rnd() * 2 - 1) * size;
const at = (day: string, minutes: number) => fromLocal(`${addDays(day, Math.floor(minutes / 1440))}T${String(Math.floor((minutes % 1440) / 60)).padStart(2, "0")}:${String(Math.round(minutes % 60)).padStart(2, "0")}`)!;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const weekday = (day: string) => ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

const whoop: (typeof whoopRecords.$inferInsert)[] = [];
const told: (typeof facts.$inferInsert)[] = [];
const gymDays: string[] = [];

for (let i = DAYS; i >= 0; i--) {
  const day = addDays(today, -i);
  const prev = addDays(day, -1);
  const wd = weekday(day);
  // The night before this morning: Friday and Saturday late, the rest around half past twelve.
  const weekend = wd === 6 || wd === 7;
  const drank = weekend && rnd() < 0.45;
  const bed = (weekend ? 25 * 60 + 30 : 24 * 60 + 20) + noise(45);
  const wake = (weekend ? 33 * 60 + 30 : 31 * 60 + 45) + noise(20);
  const inBed = wake - bed;
  const awake = 25 + rnd() * 30;
  const asleep = inBed - awake;
  const prevGym = gymDays.includes(prev);
  const recovery = Math.round(clamp(52 + (asleep / 60 - 7) * 9 - (bed - 24 * 60 - 20) / 12 - (drank ? 16 : 0) + (prevGym ? 5 : 0) + noise(9), 8, 98));
  const hrv = Math.round((44 + (recovery - 55) * 0.35 + noise(4)) * 10) / 10;
  const rhr = Math.round(57 - (recovery - 55) * 0.08 + (drank ? 3 : 0) + noise(1.5));
  const start = at(prev, bed);
  const end = at(prev, wake);
  const id = `demo-${day}`;
  const stage = (share: number) => Math.round(asleep * share * 60_000);
  whoop.push({
    id: `sleep:${id}`,
    kind: "sleep",
    externalId: id,
    startAt: start,
    endAt: end,
    day: localDay(start),
    score: Math.round(clamp((asleep / 465) * 100, 40, 100)),
    label: "SCORED",
    durationSeconds: Math.round(inBed * 60),
    raw: {
      id,
      nap: false,
      start: start.toISOString(),
      end: end.toISOString(),
      score_state: "SCORED",
      score: {
        sleep_needed: { baseline_milli: 27_000_000, need_from_sleep_debt_milli: Math.round(rnd() * 3_000_000), need_from_recent_strain_milli: 200_000, need_from_recent_nap_milli: 0 },
        stage_summary: {
          total_in_bed_time_milli: Math.round(inBed * 60_000),
          total_awake_time_milli: Math.round(awake * 60_000),
          total_light_sleep_time_milli: stage(0.52),
          total_slow_wave_sleep_time_milli: stage(0.2),
          total_rem_sleep_time_milli: stage(0.28),
          disturbance_count: Math.round(6 + rnd() * 8),
          sleep_cycle_count: Math.round(asleep / 95),
        },
        respiratory_rate: Math.round((15.4 + noise(0.5)) * 10) / 10,
        sleep_efficiency_percentage: Math.round((asleep / inBed) * 1000) / 10,
        sleep_consistency_percentage: Math.round(clamp(70 - Math.abs(bed - 24 * 60 - 20) / 3 + noise(6), 30, 95)),
        sleep_performance_percentage: Math.round(clamp((asleep / 465) * 100, 40, 100)),
      },
    },
  });
  whoop.push({
    id: `recovery:${id}`,
    kind: "recovery",
    externalId: id,
    startAt: at(day, wake - 1440 + 20),
    day,
    score: recovery,
    label: "SCORED",
    raw: { sleep_id: id, score_state: "SCORED", score: { recovery_score: recovery, hrv_rmssd_milli: hrv, resting_heart_rate: rhr, spo2_percentage: 96 + noise(1), skin_temp_celsius: 34.4 + noise(0.3) } },
  });

  // Gym Monday, Wednesday and Friday at half past six; a run on Tuesday and Saturday.
  const gym = [1, 3, 5].includes(wd) && rnd() < 0.85 && i > 0;
  const run = [2, 6].includes(wd) && rnd() < 0.7 && i > 0;
  const zones = (mins: number[]) => Object.fromEntries(["zero", "one", "two", "three", "four", "five"].map((k, z) => [`zone_${k}_milli`, Math.round((mins[z] ?? 0) * 60_000)]));
  const workout = (sport: string, from: number, mins: number, zoneMins: number[], strain: number, km: number | null) => {
    const s = at(day, from);
    const e = at(day, from + mins);
    whoop.push({
      id: `workout:${id}-${sport}`,
      kind: "workout",
      externalId: `${id}-${sport}`,
      startAt: s,
      endAt: e,
      day,
      score: strain,
      label: sport,
      durationSeconds: mins * 60,
      raw: {
        id: `${id}-${sport}`,
        sport_name: sport,
        start: s.toISOString(),
        end: e.toISOString(),
        score_state: "SCORED",
        score: { strain, kilojoule: mins * 38, average_heart_rate: sport === "running" ? 148 : 112, max_heart_rate: sport === "running" ? 176 : 158, distance_meter: km ? km * 1000 : null, zone_durations: zones(zoneMins) },
      },
    });
  };
  if (gym) {
    gymDays.push(day);
    workout("weightlifting", 18 * 60 + 30 + noise(30), 60, [10, 32, 12, 5, 1, 0], Math.round((11 + noise(1.5)) * 10) / 10, null);
  }
  if (run) workout("running", (wd === 6 ? 11 * 60 : 7 * 60 + 30) + noise(20), 42, [2, 4, 14, 14, 7, 1], Math.round((12.5 + noise(1.5)) * 10) / 10, Math.round((7 + noise(1.5)) * 10) / 10);

  const strain = Math.round((7 + (gym ? 4 : 0) + (run ? 5 : 0) + noise(1.5)) * 10) / 10;
  const cycleStart = at(prev, bed);
  whoop.push({
    id: `cycle:${id}`,
    kind: "cycle",
    externalId: id,
    startAt: cycleStart,
    day: localDay(cycleStart),
    score: strain,
    label: "SCORED",
    raw: {
      id,
      start: cycleStart.toISOString(),
      end: null,
      score_state: "SCORED",
      score: { strain, kilojoule: 8_600 + strain * 120, average_heart_rate: 66 + Math.round(noise(4)), max_heart_rate: run ? 176 : 158 },
      step_count: Math.round(7_000 + (run ? 7_000 : 0) + noise(2_500)),
    },
  });

  if (i > FACT_DAYS) continue;
  // What he told the chat: meals, the gym, his mood. Drinks on the nights he drank.
  const meal = (kind: string, minutes: number, summary: string, foods: Food[], extra: Partial<FactData> = {}) =>
    told.push({
      kind: "meal",
      at: at(day, minutes),
      day,
      summary,
      data: { meal: kind, items: foods.map((f) => f.name), foods, kcal: foods.reduce((a, f) => a + (f.kcal ?? 0), 0), proteinG: foods.reduce((a, f) => a + (f.proteinG ?? 0), 0), alcohol: false, caffeine: false, ...extra },
      model: "demo",
      promptVersion: "demo",
    });
  const food = (name: string, grams: number, kcal: number, proteinG: number, fiberG = 0): Food => ({ name, grams, kcal, proteinG, fiberG, carbsG: 0, sugarG: 0, fatG: 0, satFatG: 0, saltG: 0 });
  meal("breakfast", 8 * 60 + 15, "Desayuno: tostada con aguacate y huevos, café con leche", [food("Pan integral", 60, 150, 6, 4), food("Aguacate", 50, 80, 1, 3), food("Huevos", 120, 170, 15), { ...food("Café con leche", 200, 80, 6), caffeineMg: 80 }], { caffeine: true });
  if (rnd() < 0.85) meal("lunch", 14 * 60 + 15, "Comida: pollo con arroz y ensalada", [food("Pechuga de pollo", 180, 290, 50), food("Arroz", 150, 190, 4, 1), food("Ensalada", 150, 40, 2, 3)]);
  if (rnd() < 0.8) meal("dinner", 21 * 60 + 30, rnd() < 0.5 ? "Cena: salmón con verduras" : "Cena: lentejas con verdura", [food(rnd() < 0.5 ? "Salmón" : "Lentejas", 160, 320, 30, 6), food("Verduras", 200, 80, 4, 6)]);
  if (drank) meal("drink", 23 * 60 + 30, "Bebida: dos copas de vino", [{ ...food("Vino tinto", 300, 250, 0), alcoholG: 24 }], { alcohol: true });
  if (gym) {
    told.push({
      kind: "training",
      at: at(day, 19 * 60 + 30),
      day,
      summary: "Sentadilla 4x6 a 90 kg, press banca 4x8 a 70 kg, remo 3x10 a 60 kg",
      data: { training: "gym", exercises: [{ name: "Sentadilla", sets: 4, reps: 6, weightKg: 90 }, { name: "Press banca", sets: 4, reps: 8, weightKg: 70 }, { name: "Remo con barra", sets: 3, reps: 10, weightKg: 60 }] },
      model: "demo",
      promptVersion: "demo",
    });
  }
  told.push({
    kind: "other",
    at: at(day, 22 * 60),
    day,
    summary: `Ánimo: ${Math.round(clamp(5 + recovery / 25 + noise(1), 3, 9))}/10`,
    data: { kind: "animo", name: "Ánimo", category: "Ánimo", value: Math.round(clamp(5 + recovery / 25 + noise(1), 3, 9)), unit: "/10", state: true },
    model: "demo",
    promptVersion: "demo",
  });
}

const card = (summary: string, use: string, evidence: ProductInfo["evidence"], cautions: string[] = []): ProductInfo => ({ summary, actives: [], ingredients: [], cautions, use, evidence, sources: [] });
const PRODUCTS = [
  { name: "Vinagre con sal y agua", area: "suplemento", moment: "ayunas", since: 20, ingredient: "1 cucharada de vinagre sin filtrar, unas escamas de sal, 600 ml de agua", info: card("Vaso de agua con vinagre de manzana y sal, en ayunas.", "Antes de la comida con más hidratos, diluido.", { verdict: "a medias", line: "Baja algo el pico de glucosa de una comida con hidratos; solo en ayunas, poco efecto.", dose: "1 a 2 cucharadas diluidas, antes de comer." }) },
  { name: "Omega 3", area: "suplemento", moment: "media mañana", since: 60, ingredient: "EPA 500 mg, DHA 250 mg", info: card("Aceite de pescado en cápsulas.", "Con una comida con grasa.", { verdict: "a medias", line: "En gente sana, efecto pequeño en el corazón (VITAL 2019).", dose: "250 a 1.000 mg de EPA y DHA al día; la tuya está dentro." }) },
  { name: "Creatina monohidrato", area: "suplemento", moment: "media mañana", since: 60, ingredient: "Creatina 5 g", info: card("Creatina en polvo.", "A diario, a cualquier hora.", { verdict: "funciona", line: "Más fuerza y masa magra con pesas (Kreider 2017, revisión ISSN).", dose: "3 a 5 g al día; la tuya, 5 g, es la estudiada." }, ["Sube la creatinina del análisis de sangre sin dañar el riñón: díselo a tu médico."]) },
  { name: "Colágeno con vitamina C", area: "suplemento", moment: "entreno", since: 40, ingredient: "Colágeno 15 g, vitamina C 50 mg", info: card("Colágeno hidrolizado con vitamina C.", "30 a 60 min antes de entrenar.", { verdict: "a medias", line: "Sube la síntesis de colágeno en ensayos pequeños (Shaw 2017).", dose: "15 g con 50 mg de vitamina C; la tuya es la estudiada." }) },
  { name: "Proteína en polvo", area: "suplemento", moment: null, since: 60, ingredient: "25 g por cacito", info: card("Proteína de suero.", "Cuando no llegas a tu proteína del día.", { verdict: "funciona", line: "Con pesas, la proteína suma hasta ~1,6 g/kg al día (Morton 2018).", dose: "Lo que te falte hasta 1,6 g/kg." }) },
  { name: "Fusion Water SPF 50", area: "piel", category: "solar", spf: 50, moment: "mañana", since: 90, ingredient: null, info: card("Protector solar facial ligero.", "Cada mañana, también nublado.", null) },
  { name: "Retinol 0,3 %", area: "piel", category: "retinol", moment: "noche", since: 90, ingredient: "Retinol 0,3 %", info: card("Sérum de retinol para la noche.", "Por la noche, 3 veces por semana.", null) },
] as const;

const report = { whoop: whoop.length, facts: told.length, products: PRODUCTS.length, days: `${addDays(today, -DAYS)} … ${today}` };
console.log(report);
if (!write) {
  console.log("Dry-run: añade --write para vaciar la base de la demo y llenarla.");
  process.exit(0);
}

await db.execute(sql`truncate whoop_records, facts, product_uses, products, checks, commitments, chat_messages, assistant_messages, medical, reminders, sync_state restart identity cascade`);
for (let i = 0; i < whoop.length; i += 500) await db.insert(whoopRecords).values(whoop.slice(i, i + 500));
await db.insert(whoopRecords).values({ id: "body:me", kind: "body", externalId: "me", raw: { height_meter: 1.8, weight_kilogram: 78, max_heart_rate: 188 } });
for (let i = 0; i < told.length; i += 500) await db.insert(facts).values(told.slice(i, i + 500));

const routines = await db
  .insert(commitments)
  .values([
    { title: "Gimnasio", activities: ["gym"], metric: "sessions", target: 3, period: "week", proof: "auto" },
    { title: "Correr", activities: ["run"], metric: "km", target: 12, period: "week", proof: "auto" },
    { title: "Dormir", activities: ["sleep"], metric: "bedtime", target: 30, period: "day", proof: "auto" },
    ...["Rutina de mañana", "Rutina de noche", "Antes de entrenar", "En ayunas", "Media mañana"].map((title) => ({ title, metric: "sessions" as const, target: 1, period: "day" as const, proof: "check" as const })),
  ])
  .returning({ id: commitments.id, title: commitments.title });
const routineOf = (moment: string | null) =>
  routines.find((r) => r.title === { mañana: "Rutina de mañana", noche: "Rutina de noche", entreno: "Antes de entrenar", ayunas: "En ayunas", "media mañana": "Media mañana" }[moment ?? ""]);

for (const p of PRODUCTS) {
  const [row] = await db
    .insert(products)
    .values({ name: p.name, area: p.area, category: "category" in p ? p.category : "otro", spf: "spf" in p ? p.spf : null, ingredient: p.ingredient, moment: p.moment, kind: p.area === "piel" ? "habit" : "pill", info: p.info, infoStatus: "ready" })
    .returning({ id: products.id });
  const uses: string[] = [];
  for (let i = p.since; i >= 1; i--) {
    const day = addDays(today, -i);
    // The training one only on gym days; the rest most days.
    if (p.moment === "entreno" ? gymDays.includes(day) : rnd() < 0.85) uses.push(day);
  }
  if (uses.length > 0) await db.insert(productUses).values(uses.map((day) => ({ productId: row!.id, day, at: at(day, 11 * 60) })));
  const routine = routineOf(p.moment);
  if (routine && uses.length > 0) {
    await db.insert(checks).values(uses.map((day) => ({ day, key: `commitment-${routine.id}`, commitmentId: routine.id, source: "panel" }))).onConflictDoNothing();
  }
}

await db.insert(medical).values([
  { kind: "test", title: "Analítica anual: todo en rango", details: "Hemograma, perfil lipídico y glucosa normales. Vitamina D 28 ng/ml, algo baja.", onDay: addDays(today, -40), topic: "Revisiones" },
  { kind: "diagnosis", title: "Rinitis alérgica", details: "Primavera, con antihistamínico cuando hace falta.", topic: "Antecedentes" },
  { kind: "pending", title: "Pedir cita de revisión con el dermatólogo", details: "Revisión anual de lunares.", topic: "Piel" },
]);

const said = [
  { direction: "in", body: "me he tomado la creatina y el omega" },
  { direction: "out", body: "Hecho, media mañana marcada." },
  { direction: "in", body: "¿qué ceno hoy? llevo poca proteína" },
  { direction: "out", body: "Hoy: 1.420 kcal, 78 g de proteína de 125. Salmón con verduras y un yogur griego te dejan en 120." },
];
await db.insert(chatMessages).values(said.map((m, i) => ({ ...m, type: "text", status: m.direction === "out" ? "sent" : null, channel: "web" as const, createdAt: at(today, 11 * 60 + i * 3) })));

await db.insert(assistantMessages).values([
  {
    kind: "morning",
    day: today,
    status: "not-configured",
    body: "Recuperación 71 %, dormiste 7 h 20.\n• Gimnasio a las 18:30: hoy toca apretar\n• Creatina y omega 3 a media mañana\n• A la cama a las 00:15",
    items: [
      { area: "training", title: "Pierna pesada a las 18:30", detail: "Recuperación 71 %, la mejor de la semana" },
      { area: "food", title: "Proteína en cada comida", detail: "Te faltaron 30 g ayer de 125" },
      { area: "sleep", title: "Sin pantallas desde las 23:45", detail: "Las noches antes de las 00:30 recuperas 12 puntos más" },
    ],
  },
  {
    kind: "reading",
    day: addDays(today, -2),
    status: "saved",
    body: "Lo que más te mueve la recuperación es la hora de acostarte y el alcohol del fin de semana. El gimnasio te sienta bien al día siguiente. La fuerza y el cardio van en lo que pide la OMS: mantenlo.",
    items: [
      { area: "sleep", title: "Acuéstate antes de las 00:30, también el viernes", detail: "Esas noches recuperas 12 puntos más y la VFC sube 5 ms (seguro)." },
      { area: "food", title: "Una copa como mucho el sábado", detail: "Las noches con vino la recuperación baja 15 puntos y el pulso sube 3 lpm (seguro)." },
      { area: "training", title: "Sigue con tres días de gimnasio", detail: "El día después recuperas 5 puntos más (probable)." },
    ],
  },
]);
await db.insert(syncState).values(["pocket", "whoop", "github", "whatsapp", "hypotheses", "reading"].map((source) => ({ source, lastSweptAt: new Date() })));

console.log("Hecho. La demo va hasta hoy; vuelve a lanzarlo para ponerla al día.");
process.exit(0);
