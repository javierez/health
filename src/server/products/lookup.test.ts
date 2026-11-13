import { parseInfo } from "./lookup";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const card = {
  resumen: "Sérum de retinol al 0,3 % — para la noche.",
  activos: [{ nombre: "Retinol", hace: "renueva la piel" }, { nombre: "", hace: "nada" }],
  ingredientes: ["Aqua", "Glycerin"],
  ojo: Array.from({ length: 8 }, (_, i) => `Aviso ${i + 1}`),
  uso: "Por la noche, 2 o 3 veces por semana.",
  fuentes: [
    { titulo: "INCIDecoder", url: "https://incidecoder.com/products/x" },
    { titulo: "Inventada", url: "no es una url" },
  ],
};

const info = parseInfo(card);
check("summary without dashes", info?.summary, "Sérum de retinol al 0,3 %, para la noche.");
check("a broken active drops only itself", info?.actives, [{ name: "Retinol", does: "renueva la piel" }]);
check("ingredients as on the box", info?.ingredients, ["Aqua", "Glycerin"]);
check("five cautions at most", info?.cautions.length, 5);
check("a made-up link drops only itself", info?.sources, [{ title: "INCIDecoder", url: "https://incidecoder.com/products/x" }]);
check("no summary: no card", parseInfo({ ...card, resumen: "" }), null);
check("a cream has no evidence", info?.evidence, null);
const creatine = parseInfo({ ...card, evidencia: { veredicto: "funciona", linea: "Más fuerza con pesas — Kreider 2017.", dosis: "3 a 5 g al día" } });
check("a supplement's evidence, without dashes", creatine?.evidence, { verdict: "funciona", line: "Más fuerza con pesas, Kreider 2017.", dose: "3 a 5 g al día" });
check("a made-up verdict drops the evidence, not the card", parseInfo({ ...card, evidencia: { veredicto: "milagro", linea: "x", dosis: "" } })?.evidence, null);
check("missing lists: empty, not a failure", parseInfo({ resumen: "Creatina." })?.ingredients, []);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`lookup: ${passed} passed`);
