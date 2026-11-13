import { buildDays, type Raw } from "./days";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

// Madrid is UTC+2 in October: 13:00 there is 11:00Z.
const at = (day: string, clock: string) => new Date(`${day}T${clock}:00+02:00`);
const empty: Raw = {
  sleeps: [],
  recoveries: [],
  strain: [],
  workouts: [],
  activity: [],
  code: [],
  lateCode: [],
  codeRange: null,
  whatsapp: [],
  whatsappRange: null,
  waDays: [],
  pocket: [],
  pocketRange: null,
  talks: [],
  meals: [],
  productUses: [],
  trainings: [],
  did: [],
  moods: [],
  symptoms: [],
};
const raw: Raw = {
  ...empty,
  recoveries: [
    { morning: "2026-10-11", recovery: 60, hrv: 40, rhr: 55 },
    { morning: "2026-10-12", recovery: 60, hrv: 40, rhr: 55 },
  ],
  sleeps: [{ morning: "2026-10-11", start: at("2026-10-10", "23:30"), slept: 420 }],
  meals: [
    { day: "2026-10-10", at: at("2026-10-10", "09:00"), meal: "breakfast", alcohol: false, caffeine: true, foods: [{ name: "Café con leche", caffeineMg: 80, kcal: 60 }] },
    { day: "2026-10-10", at: at("2026-10-10", "14:00"), meal: "lunch", alcohol: false, caffeine: false, foods: [{ name: "Lentejas", kcal: 450, fiberG: 14 }] },
    { day: "2026-10-10", at: at("2026-10-10", "21:30"), meal: "dinner", alcohol: false, caffeine: false, foods: [{ name: "Tortilla", kcal: 380, proteinG: 20 }] },
    { day: "2026-10-10", at: at("2026-10-10", "22:30"), meal: "drink", alcohol: true, caffeine: false, foods: [{ name: "Caña", alcoholG: 8, kcal: 86 }] },
    { day: "2026-10-11", at: at("2026-10-11", "16:30"), meal: "lunch", alcohol: false, caffeine: true, foods: [{ name: "Café solo", caffeineMg: 60 }] },
  ],
};
const [sat, sun] = buildDays(raw, "2026-10-12");
check("a told day adds up its foods, the drink too", [sat?.food?.kcal, sat?.food?.fiberG, sat?.food?.alcoholG], [976, 14, 8]);
check("no dinner told: no totals, it would pass for eating little", sun?.food, null);
check("last meal to bed: the dinner, not the beer after it", sat?.lastMeal, 120);
check("no sleep that night: no last meal", sun?.lastMeal, null);
check("coffee at 09:00 is not late", sat?.lateCaffeine, false);
check("coffee at 16:30 is late", sun?.lateCaffeine, true);

// WHOOP scored the 11th's morning (so the 10th) but saw no workout; he told the chat he did legs.
const [told, untold, unseen] = buildDays(
  {
    ...raw,
    recoveries: [{ morning: "2026-10-11", recovery: 60, hrv: 40, rhr: 55 }],
    trainings: [
      { day: "2026-10-10", training: "gym" },
      { day: "2026-10-12", training: "run" },
    ],
    did: [
      { day: "2026-10-10", name: "Leer 20 min" },
      { day: "2026-10-10", name: "Leer 20 min" },
      { day: "2026-10-11", name: "Meditar" },
    ],
  },
  "2026-10-13",
);
check("a gym session told in the chat is training, even if WHOOP missed it", [told?.trained, told?.strength, told?.cardio], [true, true, false]);
check("no WHOOP and nothing told: unknown, not «no training»", [untold?.trained, untold?.strength], [null, null]);
check("a run told on a day WHOOP did not score is cardio", [unseen?.trained, unseen?.cardio, unseen?.strength], [true, true, null]);
check("habits and his own things, once per day", [told?.did, untold?.did, unseen?.did], [["Leer 20 min"], ["Meditar"], []]);

// He gives his mood each night: on the 10th a 6 and a headache, on the 11th an 8 and nothing, on the 12th he said nothing.
const [headache, fine, silent] = buildDays(
  {
    ...raw,
    moods: [
      { day: "2026-10-10", value: 6 },
      { day: "2026-10-11", value: 8 },
      { day: "2026-10-11", value: 7 },
    ],
    symptoms: [{ day: "2026-10-10", name: "Dolor de cabeza" }],
  },
  "2026-10-13",
);
check("the mood he told, and the next day's", [headache?.toldMood, headache?.nextMood], [6, 7.5]);
check("a symptom told is a symptom day", [headache?.symptoms, headache?.symptom, headache?.nextSymptom], [["Dolor de cabeza"], true, false]);
check("a mood and no symptom: a day without", [fine?.symptom, fine?.nextSymptom], [false, null]);
check("nothing said: unknown, not «no symptoms»", [silent?.toldMood, silent?.symptom], [null, null]);

// On the 10th two tense chats and a tense call the Pocket heard; on the 11th only a good call; the 12th, nothing read.
const chat = (tone: "buena" | "tensa", topic: "Clientes" | "Socio") => ({ chat: "34600", name: "Ana", messages: 4, line: "", tone, topic, effect: null });
const [loud, calm, unread] = buildDays(
  {
    ...raw,
    waDays: [{ day: "2026-10-10", mood: 2, summary: "", chats: [chat("tensa", "Clientes"), chat("tensa", "Clientes"), chat("buena", "Socio")] }],
    talks: [
      { day: "2026-10-10", tone: "mala", topic: "Socio" },
      { day: "2026-10-11", tone: "buena", topic: "Clientes" },
    ],
  },
  "2026-10-13",
);
check("a tense call counts like a tense chat", [loud?.tenseChats, loud?.tenseTopics], [3, ["Clientes", "Socio"]]);
check("a day with only Pocket is read too", [calm?.tenseChats, calm?.topics], [0, ["Clientes"]]);
check("nothing read: unknown, not «no tension»", unread?.tenseChats, null);

// The band and the Pocket (21-oct-2026). Seven scored mornings, 10th to 16th; bed at 00:00, then 02:00 on the 16th.
const week = Array.from({ length: 7 }, (_, i) => `2026-10-${String(10 + i).padStart(2, "0")}`);
const band = buildDays(
  {
    ...empty,
    recoveries: week.map((d) => ({ morning: `2026-10-${String(Number(d.slice(8)) + 1).padStart(2, "0")}`, recovery: 60, hrv: 40, rhr: 55 })),
    sleeps: week.map((d, i) => {
      const morning = `2026-10-${String(Number(d.slice(8)) + 1).padStart(2, "0")}`;
      return { morning, start: at(morning, i === 6 ? "02:00" : "00:00"), slept: 420 };
    }),
    // 30 min of zones 1-3 every day and 10 of zones 4-5 on the 16th; 600 steps on the 15th is the band off.
    activity: week.map((d, i) => ({ day: d, steps: i === 5 ? 600 : 9000, moderate: 30, vigorous: i === 6 ? 10 : 0, stress: null })),
    pocket: [{ day: "2026-10-16", business: 0, social: 40, family: 35, friends: 0, lines: "" }],
    pocketRange: ["2026-10-16", "2026-10-16"],
  },
  "2026-10-17",
);
const last = band.at(-1)!;
check("steps: the band off is unknown, not a lazy day", [band[5]?.steps, last.steps], [null, 9000]);
check("zone minutes, that day", [last.moderateMin, last.vigorousMin], [30, 10]);
check("the week's cardio: vigorous counts twice", last.activeWeek, 7 * 30 + 2 * 10);
check("under five scored mornings, the week is unknown", band[2]?.activeWeek, null);
check("two hours past his usual bed", [band[5]?.bedShift, last.bedShift], [0, 120]);
check("under four beds before, no usual bed", band[2]?.bedShift, null);
check("time with family and with friends", [last.family, last.friends, band[0]?.family], [35, 0, null]);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`days: ${passed} passed`);
