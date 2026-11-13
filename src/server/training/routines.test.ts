import { doneOf, parseRoutines, prescription, routineLine } from "./routines";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const leg = {
  nombre: "Rutina de pierna",
  ejercicios: [
    { nombre: "Sentadilla isométrica en pared", series: 3, segundos: 30 },
    { nombre: "Puente de glúteo a una pierna", series: 3, reps: 12, nota: "por pierna" },
    { nombre: "Zancada con mancuernas", series: 3, reps: 10, peso_kg: 12.5 },
  ],
};

check("a routine in his words", parseRoutines({ guardar: [leg] }), {
  save: [
    {
      name: "Rutina de pierna",
      exercises: [
        { name: "Sentadilla isométrica en pared", sets: 3, seconds: 30 },
        { name: "Puente de glúteo a una pierna", sets: 3, reps: 12, note: "por pierna" },
        { name: "Zancada con mancuernas", sets: 3, reps: 10, weightKg: 12.5 },
      ],
    },
  ],
  archive: [],
});
check("changing one keeps its id", parseRoutines({ guardar: [{ ...leg, id: 4 }] }).save[0]?.id, 4);
check("no exercises, nothing saved", parseRoutines({ guardar: [{ nombre: "Vacía", ejercicios: [] }] }).save, []);
check("an exercise without a name drops", parseRoutines({ guardar: [{ nombre: "X", ejercicios: [{ series: 3 }, { nombre: "Plancha" }] }] }).save[0]?.exercises, [{ name: "Plancha" }]);
check(
  "a note the name already says goes",
  parseRoutines({ guardar: [{ nombre: "X", ejercicios: [{ nombre: "Puente de glúteo con banda", nota: "con banda" }, { nombre: "Zancada", nota: "por pierna" }] }] }).save[0]?.exercises.map((e) => e.note),
  [undefined, "por pierna"],
);
check("archive by id", parseRoutines({ archivar: [3, "x", 0] }).archive, [3]);
check("no dashes from the model", parseRoutines({ guardar: [{ nombre: "Pierna — día 1", ejercicios: [{ nombre: "Plancha" }] }] }).save[0]?.name.includes("—"), false);

check("reps", prescription({ name: "a", sets: 3, reps: 12, note: "por pierna" }), "3×12 · por pierna");
check("a hold", prescription({ name: "a", sets: 3, seconds: 30 }), "3×30 s");
check("with weight", prescription({ name: "a", sets: 3, reps: 10, weightKg: 12.5 }), "3×10 · 12,5 kg");
check("only seconds", prescription({ name: "a", seconds: 45 }), "45 s");
check("only sets", prescription({ name: "a", sets: 2 }), "2 series");
check("nothing said", prescription({ name: "a" }), "");

check(
  "the line the agent reads",
  routineLine({ id: 3, name: "Rutina de pierna", exercises: [{ name: "Sentadilla isométrica en pared", sets: 3, seconds: 30 }, { name: "Plancha de oso" }] }),
  "- [3] Rutina de pierna: 1. Sentadilla isométrica en pared (3×30 s); 2. Plancha de oso",
);

check("part of it, accents aside", doneOf(["Puente de glúteo", "Plancha de oso", "Zancada"], ["puente de gluteo", "Zancada", "Curl"]), 2);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
