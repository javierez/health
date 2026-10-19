import { passwordProblem } from "~/lib/password";
import { firstIp, MAX_TRIES, wrongCode } from "./reset";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

check("Vesta's rule: a good one passes", passwordProblem("Salud2026"), null);
check("too short", passwordProblem("Sa1"), "8 caracteres o más");
check("no lowercase", passwordProblem("SALUD2026"), "Falta una minúscula");
check("no uppercase", passwordProblem("salud2026"), "Falta una mayúscula");
check("no number", passwordProblem("SaludSalud"), "Falta un número");
check("an accented capital counts", passwordProblem("ángelÉ2026"), null);
check("absurdly long", passwordProblem(`Aa1${"x".repeat(130)}`), "128 caracteres como mucho");

check("first wrong try", wrongCode(1), `Código incorrecto. Te quedan ${MAX_TRIES - 1} intentos.`);
check("one left, singular", wrongCode(MAX_TRIES - 1), "Código incorrecto. Te queda 1 intento.");
check("the last one kills it", wrongCode(MAX_TRIES), "Código incorrecto. Pide otro.");

check("the client, not the proxies", firstIp("81.40.1.2, 76.76.21.9"), "81.40.1.2");
check("no header, no address", firstIp(null), null);
check("an empty header neither", firstIp("  "), null);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
