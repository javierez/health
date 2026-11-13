import type { Day } from "./days";
import { findings, type Ranked } from "./findings";
import { toCandidate, type Spec } from "./hypotheses";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

/** Every finding of a tab, whatever its tier. */
const every = (r: Ranked) => [...r.good, ...r.bad, ...r.unclear, ...r.neutral];

// A fixed wobble, so the tests are the same every run.
let seed = 7;
const noise = (size: number) => {
  seed = (seed * 16807) % 2147483647;
  return ((seed / 2147483647) * 2 - 1) * size;
};

const base: Day = {
  day: "2026-09-01",
  weekday: 2,
  bed: 25 * 60 + 30,
  slept: 400,
  debt: 0,
  bedShift: null,
  recovery: 55,
  hrv: 42,
  rhr: 55,
  nextLines: 9000,
  trained: false,
  strength: false,
  cardio: false,
  lateWorkout: false,
  strain: 10,
  steps: null,
  moderateMin: null,
  vigorousMin: null,
  activeWeek: null,
  stress: null,
  lines: 9000,
  lateCode: false,
  sent: 100,
  lateSent: 0,
  chats: 10,
  phoneToBed: 90,
  tenseChats: null,
  topics: null,
  tenseTopics: null,
  business: null,
  social: null,
  family: null,
  friends: null,
  alcohol: null,
  caffeine: null,
  lateCaffeine: null,
  food: null,
  lastMeal: null,
  products: [],
  did: [],
  toldMood: null,
  symptoms: [],
  symptom: null,
  nextMood: null,
  nextSymptom: null,
  text: "",
};
const many = (n: number, m: Partial<Day>, wobble = 3) =>
  Array.from({ length: n }, () => ({ ...base, ...m, recovery: (m.recovery ?? base.recovery!) + noise(wobble) }));

// Early nights recover 65, middle 57, late 49: going to bed early does him good.
const owl = [...many(25, { bed: 25 * 60, recovery: 65 }), ...many(25, { bed: 26 * 60, recovery: 57 }), ...many(25, { bed: 27 * 60, recovery: 49 })];
const f = findings(owl);
const early = f.by.recovery.good.find((x) => x.key === "bed-early");
check("early bedtime: good for recovery", early?.tier, "good");
check("early bedtime: the gap", early?.big, "+16");
check("early bedtime: sure", early?.sure, true);
check("early bedtime: the action", early?.todo, { verb: "haz", action: "a la cama antes de las 01:00" });

// The weekend trap: Fridays and Saturdays are the late nights. At the same bedtime they cost nothing.
const trap = [
  ...many(20, { bed: 25 * 60, recovery: 65 }),
  ...many(20, { bed: 26 * 60, recovery: 57 }),
  ...many(15, { bed: 27 * 60, recovery: 49 }),
  ...many(15, { bed: 27 * 60, recovery: 49, weekday: 5 }),
  ...many(10, { bed: 26 * 60, recovery: 57, weekday: 6 }),
];
const t = findings(trap);
const weekend = every(t.by.recovery).find((x) => x.key === "weekend");
check("weekend: no effect at the same bedtime", weekend?.tier, "none");
check("weekend: the raw chart still shows its nights", weekend?.groups[0].values.length, 25);
check("weekend: it goes with his nights, he cannot avoid a Friday", [weekend?.controllable, weekend?.todo], [false, null]);

// Training lowers his resting pulse by 4: lower is the good direction.
const pulse = [...many(30, { trained: true, rhr: 51 }), ...many(30, { rhr: 55 })].map((d) => ({ ...d, rhr: d.rhr! + noise(1) }));
const rhr = findings(pulse).by.rhr.good.find((x) => x.key === "trained");
check("training: lower pulse is good", [rhr?.tier, rhr?.big], ["good", "−4"]);

// A big gap drowned in noise: «por aclarar», not a finding.
const noisy = findings([...many(16, { lateCode: true, recovery: 62 }, 40), ...many(16, { recovery: 55 }, 40)]);
const late = every(noisy.by.recovery).find((x) => x.key === "code-late");
check("big but noisy: unclear", late?.tier === "unclear" || late?.tier === "none", true);

// Nine nights are not a pattern.
const few = findings([...many(9, { alcohol: true, recovery: 40 }), ...many(30, { alcohol: false })]);
check("nine nights: waiting", few.waiting.includes("Beber"), true);

// The tabs: late WhatsApp costs 40 min of sleep, judged on «Sueño».
const wa = findings([...many(20, { lateSent: 9, slept: 360 }), ...many(20, { lateSent: 0, slept: 400 })].map((d) => ({ ...d, slept: d.slept! + noise(5) })));
const sleep = wa.by.sleep.bad.find((x) => x.key === "late-whatsapp");
check("late WhatsApp: bad for sleep, about 40 min", [sleep?.tier, Math.abs(Number(sleep?.big.slice(1)) - 40) <= 4], ["bad", true]);
check("short sleep is not judged on sleep", every(wa.by.sleep).some((x) => x.key === "short-sleep"), false);

// An AI hypothesis: the days a word comes up.
const spec: Spec = {
  title: "Días que sale la mudanza",
  why: "Aparece en sus días tensos.",
  labels: ["Con mudanza", "Sin"],
  when: [{ mentions: "mudanza" }],
  versus: "rest",
  good: { verb: "haz", action: "sigue así" },
  bad: { verb: "evita", action: "hablar de la mudanza por la noche" },
  controllable: false,
};
const moving = findings([...many(15, { text: "llamada con la agencia por la mudanza", recovery: 45 }), ...many(25, { text: "clientes", recovery: 58 })], [
  toCandidate(1, spec),
]);
const ai = moving.by.recovery.bad.find((x) => x.key === "ai-1");
check("AI hypothesis: tested like the rest", [ai?.tier, ai?.why], ["bad", "Aparece en sus días tensos."]);

// «tac» is a word, not the middle of «contacto».
const tac = findings([...many(16, { text: "resultados del tac", recovery: 40 }), ...many(30, { text: "un contacto nuevo", recovery: 58 })], [
  toCandidate(2, { ...spec, title: "Días de tac", when: [{ mentions: "tac" }] }),
]);
check("mentions: whole word start", every(tac.by.recovery).find((x) => x.key === "ai-2")?.groups.map((g) => g.values.length), [16, 30]);

// The balance: last night early to bed scores its points; a late night scores nothing.
const scored = findings([...owl, { ...base, bed: 25 * 60, recovery: 70 }]).balance.recovery;
const lastNight = scored.days.at(-1)!;
check("balance: early bed scores", lastNight.items.map((x) => [x.key, Math.abs(x.points - 16) <= 1]), [["bed-early", true]]);
check("balance: total is the sum", lastNight.total, lastNight.items[0]?.points);
check("balance: seven days", scored.days.length, 7);
const lateNight = findings(owl).balance.recovery.days.at(-1)!;
check("balance: a late night scores nothing", lateNight.total, 0);

// A product from «Productos»: judged from its first day; the weeks before it are neither side.
const dated = (days: Day[], from: string) => days.map((d, i) => ({ ...d, day: `2026-${from}-${String(i + 1).padStart(2, "0")}` }));
const creatine = findings([
  ...dated(many(20, { recovery: 40 }), "06"),
  ...dated([...many(15, { products: ["Creatina"], recovery: 64 }), ...many(15, { recovery: 54 })], "07"),
]);
const took = every(creatine.by.recovery).find((x) => x.key === "product-creatina");
check("product: compared only from its first day", took?.groups.map((g) => g.values.length), [15, 15]);
check("product: good when he took it", [took?.tier, took?.todo], ["good", { verb: "haz", action: "sigue con Creatina" }]);

// Creatine every day has no day without: his six weeks before against his days from a week in.
const daily = findings([...dated(many(30, { recovery: 50 }), "06"), ...dated(many(31, { products: ["Creatina"], recovery: 62 }), "07")]);
const since = every(daily.by.recovery).find((x) => x.key === "since-creatina");
check("since: the weeks before against the days from a week in", since?.groups.map((g) => g.values.length), [24, 30]);
check("since: good, and it says it is before and after", [since?.tier, since?.title], ["good", "Desde que tomas Creatina (antes y después)"]);
check("since: no days without, so days with and without has nothing", every(daily.by.recovery).some((x) => x.key === "product-creatina"), false);

// A habit he ticks («Leer 20 min»): the same, from the first day he ticked it.
const reading = findings([
  ...dated(many(20, { slept: 380 }), "06"),
  ...dated([...many(15, { did: ["Leer 20 min"], slept: 440 }), ...many(15, { slept: 400 })], "07"),
]);
const read = every(reading.by.sleep).find((x) => x.key === "did-leer-20-min");
check("habit: compared only from its first day", read?.groups.map((g) => g.values.length), [15, 15]);
check("habit: good when he did it", [read?.title, read?.tier, read?.todo?.action], ["Leer 20 min", "good", "sigue con «Leer 20 min»"]);

// His mood, told each night: after a sauna the next day reads 7,8 against 6,6; that day's sauna, not the next.
const moodOf = (sauna: boolean, n: number) =>
  many(n, sauna ? { did: ["Sauna"] } : {}).map((d) => ({ ...d, toldMood: 7, symptom: false, nextMood: (sauna ? 7.8 : 6.6) + noise(0.4), nextSymptom: false }));
const sauna = findings([...dated(moodOf(false, 10), "06"), ...dated([...moodOf(true, 15), ...moodOf(false, 15)], "07")]);
const calm = sauna.by.mood.good.find((x) => x.key === "did-sauna");
// 7,8 against 6,6 under noise: about +1,2, with a decimal comma.
check("mood: a habit read on the next day's mood", [calm?.tier, Math.abs(calm!.points - 1.2) <= 0.2, /^\+1,\d$/.test(calm!.big)], ["good", true, true]);

// A headache: the nights after are worse; a day he gave no mood is neither side.
const ache = findings([
  ...dated(many(10, { symptom: null, slept: 420 }), "06"),
  ...dated([...many(15, { symptoms: ["Dolor de cabeza"], symptom: true, slept: 340 + noise(15) }), ...many(15, { symptom: false, slept: 420 })], "07"),
]);
const head = every(ache.by.sleep).find((x) => x.key === "symptom-dolor-de-cabeza");
check("symptom: only days he answered count", head?.groups.map((g) => g.values.length), [15, 15]);
check("symptom: bad for sleep, and no experiment", [head?.tier, head?.controllable], ["bad", false]);
check("symptom: not judged on symptoms", every(ache.by.symptoms).some((x) => x.key === "symptom-dolor-de-cabeza"), false);

// What he ate: no thirds before 30 told days, so it waits; then his own high fibre third against his low one.
check("nutrition: waits without told days", findings(owl).waiting.includes("Mucha fibra"), true);
const told = (fiberG: number, recovery: number, n: number) =>
  many(n, { recovery, food: { kcal: 2000, proteinG: 100, carbsG: 200, sugarG: 40, fiberG, fatG: 70, satFatG: 20, saltG: 6, alcoholG: 0, caffeineMg: 0 } });
const fibre = findings([...told(10, 52, 20), ...told(20, 56, 20), ...told(35, 61, 20)]);
const fib = fibre.by.recovery.good.find((x) => x.key === "food-fiberG");
check("nutrition: fibre good for recovery", [fib?.tier, fib?.todo?.action], ["good", "legumbre, verdura y fruta cada día"]);
check("nutrition: his own thirds in the labels", fib?.groups.map((g) => g.label), ["Más de 20 g", "Hasta 10 g"]);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`findings: ${passed} passed`);
