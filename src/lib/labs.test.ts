import { howFar, labsOf, outBefore, outOf, rangeText, type LabRow } from "./labs";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const row = (day: string, panel: string, marker: string, value: number | null, low: number | null, high: number | null, shown: string | null = null): LabRow => ({
  day,
  lab: day < "2026-06-01" ? "Laboratorio A" : "Laboratorio B",
  panel,
  marker,
  value,
  shown,
  unit: null,
  low,
  high,
});

// Made-up values (his are medical data and stay off GitHub): two tests in March, one with no ranges in October, one after.
const rows: LabRow[] = [
  row("2026-10-19", "Bioquímica", "Creatinina", 1.5, 0.7, 1.2),
  row("2026-03-17", "Bioquímica", "Creatinina", 1.4, 0.7, 1.2),
  row("2026-03-28", "Bioquímica", "Creatinina", 1.25, 0.7, 1.2),
  row("2026-10-19", "Bioquímica", "Filtrado glomerular", 70, 60, 150),
  row("2026-03-17", "Hemograma", "Leucocitos", 13, 4.4, 11.3),
  row("2026-03-28", "Hemograma", "Leucocitos", 6, 4.4, 11.3),
  row("2026-10-01", "Hemograma", "Leucocitos", 5, null, null),
  row("2026-10-19", "Hemograma", "Leucocitos", 4.1, 4.4, 11.5),
  row("2026-03-28", "Bioquímica", "LDH", 120, 135, 225),
  row("2026-10-19", "Bioquímica", "LDH", 150, 135, 225),
  row("2026-10-19", "Hormonas", "TSH", 5, 0.27, 4.2),
  row("2026-10-19", "Hormonas", "T4 libre", 1.2, 0.93, 1.71),
  row("2026-10-19", "Hierro", "Saturación de transferrina", 45, 15, 45),
  row("2026-10-01", "Inflamación", "PCR", 0.6, null, null, "<0,6"),
  row("2026-10-19", "Serologías", "VIH", null, null, null, "Negativo"),
];
const labs = labsOf(rows);

check("tests oldest first", labs.tests.map((t) => t.day), ["2026-03-17", "2026-03-28", "2026-10-01", "2026-10-19"]);
check("hormones first, serologies last", labs.panels.map((p) => p.panel), ["Hormonas", "Hemograma", "Bioquímica", "Hierro", "Inflamación", "Serologías"]);
check("points oldest first", labs.panels[2]!.markers[0]!.points.map((p) => p.text), ["1,4", "1,25", "1,5"]);
// Out in the latest test, the ones out before too first: creatinine (out in March) and leukocytes
// (high in March), then TSH, first time. LDH was out in March and is fine now: not there.
check("out in the latest, repeated first", labs.now.map((m) => m.marker), ["Creatinina", "Leucocitos", "TSH"]);
check("out before", outBefore(labs.now[0]!).map((p) => p.text), ["1,4", "1,25"]);
check("out before, the other way", outBefore(labs.now[1]!).map((p) => `${p.text} ${p.out}`), ["13 high"]);
check("first time", outBefore(labs.now[2]!), []);
check("how far, high", howFar(labs.now[0]!.points.at(-1)!), "un 25 % por encima del máximo");
check("how far, low", howFar(labs.now[1]!.points.at(-1)!), "un 7 % por debajo del mínimo");
// Out only in a test that is not the latest: not there.
check("only the latest", labsOf([row("2026-03-17", "Bioquímica", "Glucosa", 139, 74, 100), row("2026-10-19", "Hormonas", "TSH", 2, 0.27, 4.2)]).now, []);
check("how far, just over", howFar({ day: "", value: 1.5, text: "", low: 0.72, high: 1.46, out: "high" }), "rozando el máximo");
check("how far, in range", howFar({ day: "", value: 1, text: "", low: 0.7, high: 1.2, out: null }), null);
check("«<0,6» is not judged", labs.panels[4]!.markers[0]!.points[0]!.out, null);
check("«Negativo» kept as printed", labs.panels[5]!.markers[0]!.points[0]!.text, "Negativo");
check("big numbers", labsOf([row("2026-10-19", "Proteínas", "IgG", 1800, 700, 1600)]).panels[0]!.markers[0]!.points[0]!.text, "1.800");

check("low", outOf(4.1, 4.4, 11.5), "low");
check("edge is in", outOf(48, 17, 48), null);
check("range", rangeText(4.4, 11.5), "4,4 a 11,5");
check("from zero reads as a ceiling", rangeText(0, 5), "menos de 5");
check("floor only", rangeText(30, null), "más de 30");

console.log(`labs: ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
