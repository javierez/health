import { advise, bedSpread, type AdviceInput } from "./evidence";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const night = (bed: number, asleep: number | null = 460) => ({ bed, asleep });
const base: AdviceInput = {
  nowMin: 10 * 60,
  bedMinutes: 23 * 60,
  nights: [night(1380), night(1385), night(1375)],
  drinksCaffeine: false,
  lastCaffeine: null,
  alcoholDays: 0,
  proteinToday: null,
  weightKg: 75,
  strengthWeek: 2,
  cardioMinutesWeek: 200,
  weekday: 2,
  covered: { strength: false, cardio: false },
};
const keys = (d: Partial<AdviceInput>) => advise({ ...base, ...d }).map((a) => a.key);

check("nothing wrong: fibre only", keys({}), ["ev-fibre"]);
check("never more than three", advise({ ...base, alcoholDays: 2, lastCaffeine: 18 * 60, nights: [night(60, 300), night(1320, 300), night(30, 300)] }).length, 3);

check("spread across midnight: 23:30 and 00:30 are close", bedSpread([1410, 30, 1410, 30]), 30);
check("fewer than three nights: no spread", bedSpread([1320, 120]), 0);
check("irregular bedtimes", keys({ nights: [night(1320), night(90), night(1380), night(30)] }).includes("ev-sleep-regular"), true);

check("short sleep on average", keys({ nights: [night(1380, 380), night(1380, 390), night(1380, 400)] })[0], "ev-sleep-short");
check("two nights are not a trend", keys({ nights: [night(1380, 300), night(1380, 300)] }).includes("ev-sleep-short"), false);

check("coffee drinker, morning: the cutoff 6 h before bed", advise({ ...base, drinksCaffeine: true }).find((a) => a.key === "ev-caffeine-cutoff")?.title, "Café después de las 17:00");
check("coffee at 10:00 is fine", keys({ drinksCaffeine: true, lastCaffeine: 600 }).includes("ev-caffeine-late"), false);
check("coffee at 18:30 with bed at 23:00: late, first", keys({ drinksCaffeine: true, lastCaffeine: 1110, nowMin: 1140 })[0], "ev-caffeine-late");
check("past the cutoff: no cutoff row", keys({ drinksCaffeine: true, nowMin: 18 * 60 }).includes("ev-caffeine-cutoff"), false);

check("alcohol in the last 3 days", keys({ alcoholDays: 1 })[0], "ev-alcohol");
const weekend = { recovery: 51, others: 58, nights: 69 };
check("his weekend costs him: on a Saturday, avoid alcohol tonight", advise({ ...base, weekday: 6, weekendNights: weekend }).find((a) => a.key === "ev-weekend")?.verb, "evita");
check("his weekend, on a Tuesday: nothing", keys({ weekday: 2, weekendNights: weekend }).includes("ev-weekend"), false);
check("already drank this weekend: the alcohol row says it, not two", keys({ weekday: 6, alcoholDays: 1, weekendNights: weekend }).includes("ev-weekend"), false);
check("every row says do or avoid", advise({ ...base, drinksCaffeine: true }).every((a) => a.verb === "haz" || a.verb === "evita"), true);

check("protein: 120 g target for 75 kg, short at 17:00", advise({ ...base, proteinToday: 60, nowMin: 17 * 60 }).find((a) => a.key === "ev-protein")?.title, "Te faltan ~60 g de proteína hoy");
check("protein: not judged before 16:00", keys({ proteinToday: 20, nowMin: 12 * 60 }).includes("ev-protein"), false);
check("fibre: his own count in the afternoon", advise({ ...base, fiberToday: 12, nowMin: 17 * 60 }).find((a) => a.key === "ev-fibre")?.title, "Te faltan ~13 g de fibra hoy");
check("fibre: the general line in the morning", advise({ ...base, fiberToday: 4 }).find((a) => a.key === "ev-fibre")?.title, "Legumbre, verdura o integral en cada comida");
check("fibre: reached, no row", keys({ fiberToday: 28, nowMin: 20 * 60 }).includes("ev-fibre"), false);
check("protein: unknown is not short", keys({ proteinToday: null, nowMin: 20 * 60 }).includes("ev-protein"), false);

check("strength behind on Thursday", keys({ weekday: 4, strengthWeek: 0 }).includes("ev-strength"), true);
check("strength behind on Tuesday: too early", keys({ weekday: 2, strengthWeek: 0 }).includes("ev-strength"), false);
check("strength: a gym commitment already says it", keys({ weekday: 4, strengthWeek: 0, covered: { strength: true, cardio: false } }).includes("ev-strength"), false);
check("cardio short on Friday", advise({ ...base, weekday: 5, cardioMinutesWeek: 90 }).find((a) => a.key === "ev-cardio")?.title, "60 min de cardio antes del domingo");

if (failures.length > 0) {
  console.error(`evidence: ${failures.length} failed, ${passed} passed\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`evidence: ${passed} passed`);
