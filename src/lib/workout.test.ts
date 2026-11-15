import type { Session, SessionLine } from "~/server/training/summary";
import { doneText, movedOf, pulseOf, scoreOf, spiderOf, statsOf, zonesOf } from "./workout";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const sets = (...rows: [number | null, number | null, number | null][]) => rows.map(([kg, reps, seconds]) => ({ kg, reps, seconds }));
const line = (name: string, detail: SessionLine["detail"], perHand?: true): SessionLine => ({ name, text: "", sets: [], detail, move: null, ...(perHand ? { perHand } : {}) });

// 14-nov-2026, as he told it on WhatsApp.
const saturday: Session = {
  day: "2026-11-14",
  said: [],
  minutes: null,
  routineId: null,
  span: { from: new Date("2026-11-14T18:33:46Z"), to: new Date("2026-11-14T19:28:38Z") },
  lines: [
    line("Press inclinado", sets([24, 10, null], [24, 10, null], [24, 10, null]), true),
    line("Sentadilla isométrica", sets([null, null, 30], [48, null, 30], [48, null, 30])),
    line("Press banca", sets([55, 10, null], [55, 10, null], [65, 10, null])),
    line("Sentadilla unilateral", sets([8, 10, null], [8, 10, null], [8, 7, null])),
    line("Aperturas", sets([12.5, 5, null])),
    line("Zancadas", sets([20, null, null])),
    line("Fondos", sets([null, 5, null])),
    line("Saltos a caja (50 cm)", sets([null, 5, null])),
  ],
};

check("dumbbells count both hands", movedOf(saturday.lines[0]!), 1440);
check("a barbell counts once", movedOf(saturday.lines[2]!), 1750);
check("no reps, nothing moved", movedOf(saturday.lines[5]!), 0);

const raw = {
  data: [
    { Avg: 54, Max: 56, Min: 52, date: "2026-11-14 19:10:00 +0100" },
    { Avg: 100, Max: 120, Min: 90, date: "2026-11-14 19:25:00 +0100" },
    { Avg: 130, Max: 164, Min: 110, date: "2026-11-14 20:00:00 +0100" },
    { Avg: 130, Max: 164, Min: 110, date: "2026-11-14 20:00:00 +0100" },
    { Avg: 99, Max: 110, Min: 90, date: "2026-11-14 20:30:00 +0100" },
    { Avg: 60, Max: 70, Min: 55, date: "2026-11-14 21:30:00 +0100" },
  ],
};
const pulse = pulseOf(raw, saturday.span);
check("pulse: the session's window, each minute once, in order", pulse.map((p) => p.t), ["19:25", "20:00", "20:30"]);
check("no time, no pulse", pulseOf(raw, null), []);

const stats = statsOf(saturday, pulse);
const minute = (avg: number) => ({ t: "20:00", avg, max: avg });
check("zones: one minute in each, below zone 1 left out", zonesOf([80, 100, 120, 140, 160, 180].map(minute), 187), { from: [94, 112, 131, 150, 168], minutes: [1, 1, 1, 1, 1] });
check(
  "spider: the small muscles join their arm",
  spiderOf({ pecho: 3, triceps: 1.5, biceps: 0.5, isquios: 2, gemelos: 1 }).map((a) => `${a.label} ${a.sets}`),
  ["Pecho 3", "Hombros 0", "Brazos 2", "Espalda 0", "Core 0", "Glúteos 0", "Cuádriceps 0", "Isquios y gemelos 3"],
);
check("stats", stats, { minutes: 66, range: { from: "19:25", to: "20:30" }, exercises: 8, sets: 16, moved: 3469, avgHr: 110, maxHr: 164 });

const score = scoreOf(saturday, stats);
check("score: four up, two down", score.score, 7);
check("score: what went well", score.plus, ["16 series, 3,5 t movidas", "66 min entrenando", "Subiste press banca de 55 kg a 65 kg", "Pulso máx 164: llegaste a esfuerzo alto"]);
check("score: what fell short", score.minus, ["Aperturas, Zancadas, Fondos y Saltos a caja (50 cm): una serie cada uno", "La última serie de sentadilla unilateral se quedó en 7 de 10"]);

const walk: Session = { day: "2026-10-18", said: [], minutes: 15, routineId: null, span: null, lines: [{ name: "Andar", text: "15 min", sets: [], detail: [], sport: true, move: null }] };
check("a short walk", scoreOf(walk, statsOf(walk, [])), { score: 4, plus: [], minus: ["Solo 15 min"] });

check("the message", doneText(stats, score, "https://pulso-ai.xyz/e/x"), "Entreno terminado: 66 min, 8 ejercicios, pulso máx 164. Nota de Pulso: 7/10.\nhttps://pulso-ai.xyz/e/x");

if (failures.length > 0) {
  console.error(`workout: ${failures.length} failed, ${passed} passed\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`workout: ${passed} passed`);
