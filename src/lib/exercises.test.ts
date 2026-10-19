import { exerciseOf, sportOf, zonesIn } from "./exercises";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const of = (name: string) => exerciseOf(name)?.name ?? null;
check("bench", of("Press banca"), "Press banca");
check("incline bench is incline, not bench", of("Press banca inclinado con mancuernas"), "Press inclinado");
check("accents and case", of("PRESS FRANCÉS"), "Tríceps");
check("Romanian is not plain deadlift", of("Peso muerto rumano"), "Peso muerto rumano");
check("deadlift", of("peso muerto"), "Peso muerto");
check("leg curl is hamstrings, not biceps", of("Curl femoral tumbado"), "Curl femoral");
check("biceps curl", of("Curl con barra Z"), "Curl");
check("Bulgarian split squat is a lunge", of("Sentadilla búlgara"), "Zancadas");
check("squat", of("Sentadilla"), "Sentadilla");
check("leg raises are abs, not shoulders", of("Elevaciones de piernas colgado"), "Abdominales");
check("face pulls are rear delts", of("Face pull"), "Pájaros");
check("a word inside another does not match", of("Carrow"), null);
check("unknown", of("Turkish get up"), null);
check("the bench works the chest most", exerciseOf("Press banca")?.work, { pecho: 1, triceps: 0.5, hombros: 0.5 });
check("a run from what he said", sportOf("Correr 6 km")?.name, "Correr");
check("a ride", sportOf("Bici: 21,5 km")?.name, "Bici");
check("a walk", sportOf("Paseo de 40 min")?.name, "Andar");
check("WHOOP's names", ["swimming", "padel", "race-walking", "spin"].map((s) => sportOf(s)?.name), ["Nadar", "Pádel", "Andar", "Bici"]);
check("weights are no sport", sportOf("weightlifting"), null);
check("a leg day without exercises", zonesIn("Gimnasio: pierna"), ["cuadriceps", "gluteos", "isquios", "aductores", "gemelos"]);
check("a run names no zone in words", zonesIn("Correr 6 km"), []);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`exercises: ${passed} passed`);
