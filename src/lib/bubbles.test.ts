import { MAX_BUBBLES, toBubbles, typingMs } from "./bubbles";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

check(
  "a blank line is a new bubble",
  toBubbles("Apuntado, sentadilla 4x6 a 100.\n\nBuen peso.\n \nMañana descansa pierna."),
  ["Apuntado, sentadilla 4x6 a 100.", "Buen peso.", "Mañana descansa pierna."],
);
check("one short line stays one", toBubbles("  Hecho.  "), ["Hecho."]);
check("nothing, no bubbles", toBubbles("\n\n"), []);
check("a single line break stays inside the bubble", toBubbles("Hecho. Gimnasio: 3 de 4.\nQuitado: Leer."), [
  "Hecho. Gimnasio: 3 de 4.\nQuitado: Leer.",
]);

const wall =
  "Magnesio a las 23:00, hecho. Por lo demás hoy te quedan la pastilla con su foto y leer los 20 minutos. " +
  "El gimnasio vas 2 de 4 con 3 días por delante. Con la recuperación en 39 %, hoy suave y zona 2. " +
  "¿Te apunto el entreno cuando lo hagas? Y esta noche a la cama a las 23:05.";
const cut = toBubbles(wall);
check("a wall of text is cut by sentences", cut.length > 1, true);
check("no bubble much over the target", cut.every((b) => b.length <= 200), true);
check("nothing lost", cut.join(" "), wall);
check("a question ends its bubble", cut.some((b) => b.endsWith("¿Te apunto el entreno cuando lo hagas?")), true);

check("never more than three", toBubbles("a\n\nb\n\nc\n\nd\n\ne\n\nf").length, MAX_BUBBLES);
check("the rest joins the last", toBubbles("a\n\nb\n\nc\n\nd\n\ne").at(-1), "c d e");

check("a short bubble types fast", typingMs("Hecho."), 572);
check("a long one is capped", typingMs("x".repeat(500)), 1_600);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
