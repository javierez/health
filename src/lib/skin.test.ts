import type { Commitment, Standing } from "~/server/commitments/standing";
import { evidenceFor, routineName, routineOf, whenText } from "./skin";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const habit = (title: string, target: number, period: "day" | "week", activities: Commitment["activities"] = []) =>
  ({ commitment: { title, target, period, activities } }) as unknown as Standing;

const solar = { category: "solar", name: "Fusion Water SPF 50", moment: "mañana" } as const;
const retinol = { category: "retinol", name: "Retinol 0,3 %", moment: "noche" } as const;
const serum = { category: "otro", name: "Sérum C", moment: null } as const;

check("every solar goes with «Crema solar»", routineName(solar), "Crema solar");
check("something else goes by its own name", routineName(serum), "Sérum C");

const list = [habit("Gimnasio", 4, "week", ["gym"]), habit("Rutina de mañana", 1, "day"), habit("Rutina de noche", 3, "week")];
check("a morning cream goes with the morning routine", routineOf(solar, list)?.commitment.title, "Rutina de mañana");
check("no moment, no routine", routineOf(serum, list), null);
check("a night with no routine yet, none", routineOf(retinol, [habit("Gimnasio", 4, "week", ["gym"])]), null);

check("a routine every day", whenText(solar, routineOf(solar, list)), "Cada mañana");
check("seven a week is every day too", whenText(solar, habit("Rutina de mañana", 7, "week")), "Cada mañana");
check("some nights a week", whenText(retinol, routineOf(retinol, list)), "3 noches por semana");
check("one night", whenText(retinol, habit("Retinol", 1, "week")), "1 noche por semana");
check("no habit yet, just the moment", whenText(retinol, null), "Noche");
check("nothing to say", whenText(serum, null), null);

check(
  "a solar gets the sun lines and the sleep one",
  evidenceFor("solar").map((e) => e.source.short),
  ["Hughes et al., Ann Intern Med 2013", "American Academy of Dermatology", "Oyetakin-White et al., Clin Exp Dermatol 2015"],
);
check("a cleanser, only what is true of every cream", evidenceFor("limpiador").length, 1);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
