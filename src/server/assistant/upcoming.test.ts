import { daysNamed, upcoming } from "./upcoming";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

// Friday 23-oct-2026, what was heard about the thyroid; read on Monday the 26th.
const friday = new Date("2026-10-23T10:00:00Z");
const heard = (summary: string, at = friday) => ({ at, summary });

check("el lunes, from a Friday", daysNamed("Consulta el lunes a las 15:45", "2026-10-23"), ["2026-10-26"]);
check("el lunes, from a Monday: the next one", daysNamed("Consulta el lunes", "2026-10-26"), ["2026-11-02"]);
check("two days in one line", daysNamed("Le han llamado para que viaje el lunes y le hagan pruebas el martes", "2026-10-23"), [
  "2026-10-26",
  "2026-10-27",
]);
check("mañana", daysNamed("Cita mañana a las 9", "2026-10-23"), ["2026-10-24"]);
// 5-nov-2026 (Thursday): «el jueves de la semana que viene» showed as «Hoy».
check("el jueves de la semana que viene, from a Thursday", daysNamed("Tiene cita programada el jueves de la semana que viene", "2026-11-05"), ["2026-11-12"]);
check("el miércoles de la semana que viene, from a Wednesday", daysNamed("Tiene cita el miércoles de la semana que viene con Juste", "2026-11-04"), ["2026-11-11"]);
check("el lunes de la próxima semana, from a Friday", daysNamed("Prueba el lunes de la próxima semana", "2026-10-23"), ["2026-10-26"]);
check("por la mañana is a time, not a day", daysNamed("Analítica en ayunas por la mañana", "2026-10-23"), []);
check("mañana por la mañana", daysNamed("Prueba mañana por la mañana", "2026-10-23"), ["2026-10-24"]);
check("pasado mañana", daysNamed("Revisión pasado mañana", "2026-10-23"), ["2026-10-25"]);
check("a date", daysNamed("Revisión el 3 de noviembre", "2026-10-23"), ["2026-11-03"]);
check("a date already gone is next year's", daysNamed("Revisión el 5 de enero", "2026-10-23"), ["2027-01-05"]);
check("miércoles with its accent", daysNamed("Cita el miércoles", "2026-10-23"), ["2026-10-28"]);
check("la consulta del lunes is ahead", daysNamed("Ir acompañado a la consulta del lunes", "2026-10-23"), ["2026-10-26"]);

const lines = upcoming(
  [
    heard("Cita el martes a las 12:45 para que le miren el tiroides"),
    heard("Consulta el lunes a las 15:45"),
    heard("Vieron un pequeño tumorcito de tiroides en el escáner del lunes"),
    heard("Le recomiendan ir acompañado a la consulta del lunes porque hay mucha información"),
    heard("Es un cáncer de tiroides, tipo que no suele dar quimio"),
    heard("Consulta el lunes a las 10:00", new Date("2026-10-08T10:00:00Z")),
  ],
  "2026-10-26",
);
check("today first, then tomorrow; the past and the undated stay out", lines, [
  "- Hoy (lunes, 26 oct): Consulta el lunes a las 15:45",
  "- Hoy (lunes, 26 oct): Le recomiendan ir acompañado a la consulta del lunes porque hay mucha información",
  "- Mañana (martes, 27 oct): Cita el martes a las 12:45 para que le miren el tiroides",
]);
check(
  "a dated entry of his file needs no words",
  upcoming([{ at: friday, summary: "Ecografía tiroidea", day: "2026-10-30" }], "2026-10-26"),
  ["- viernes, 30 oct: Ecografía tiroidea"],
);
check("more than a week ahead waits", upcoming([heard("Revisión el 20 de noviembre")], "2026-10-26"), []);
check("said twice, said once", upcoming([heard("Consulta el lunes"), heard("Consulta el lunes")], "2026-10-26").length, 1);

if (failures.length > 0) {
  console.error(`upcoming: ${failures.length} failed, ${passed} passed\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`upcoming: ${passed} passed`);
