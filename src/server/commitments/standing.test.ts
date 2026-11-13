import {
  bedtimeOf,
  brief,
  countOf,
  dedupe,
  kindOf,
  describe,
  factActivity,
  freeWindows,
  nudgeDue,
  standing,
  tickedLine,
  weekStart,
  type Commitment,
  type Session,
} from "./standing";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

// Madrid is UTC+2 in October 2026. Thursday 15-oct-2026, 19:00 local.
const thu = new Date("2026-10-15T17:00:00Z");
const at = (iso: string) => new Date(iso);
const s = (iso: string, activity: Session["activity"], km: number | null = null, source: Session["source"] = "whoop"): Session => ({
  at: at(iso),
  activity,
  km,
  minutes: 60,
  source,
});

const gym: Commitment = { id: 1, title: "Gimnasio", activities: ["gym"], metric: "sessions", target: 4, period: "week", proof: "auto" };
const cardio: Commitment = { id: 2, title: "Correr o bici", activities: ["run", "bike"], metric: "km", target: 40, period: "week", proof: "auto" };

check("week starts on Monday", weekStart(thu), "2026-10-12");
check("Sunday 23:30 is still that week", weekStart(at("2026-10-18T21:30:00Z")), "2026-10-12");
check("Monday 00:30 starts the next", weekStart(at("2026-10-18T22:30:00Z")), "2026-10-19");

check("bike from a fact's words", factActivity("other", "Bici: 32 km por la Casa de Campo"), "bike");
check("a walk is not a ride", factActivity("other", "Paseo de una hora"), null);

const sessions = dedupe([
  s("2026-10-12T16:00:00Z", "gym"),
  s("2026-10-12T17:10:00Z", "gym", null, "fact"), // "he ido al gimnasio", an hour later
  s("2026-10-14T06:00:00Z", "run", 8.2),
  s("2026-10-11T08:00:00Z", "bike", 50), // last Sunday: the week before
  s("2026-10-13T18:00:00Z", "bike", 21.5, "fact"),
]);
check("WHOOP and the chat saying it: one session", sessions.filter((x) => x.activity === "gym").length, 1);

const chatOnly = dedupe([
  s("2026-10-16T15:40:00Z", "gym", null, "fact"), // squats
  s("2026-10-16T15:55:00Z", "gym", null, "fact"), // then bench, same session
  s("2026-10-16T20:30:00Z", "gym", null, "fact"), // back in the evening: another
  s("2026-10-16T07:00:00Z", "run", 5, "fact"),
  s("2026-10-16T07:40:00Z", "run", 3, "fact"), // "y luego otros 3"
]);
check("two exercises from the chat: one gym session", chatOnly.filter((x) => x.activity === "gym").length, 2);
check("a run told in two goes: one run, km added", chatOnly.filter((x) => x.activity === "run").map((x) => x.km), [8]);

const g = standing(gym, sessions, [], thu);
check("gym: 1 of 4 on Thursday, 4 days left with today", [g.done, g.left, g.daysLeft], [1, 3, 4]);
check("gym: 1 by Thursday is behind", g.status, "behind");
check("gym: the week drawn, Monday first", g.days.map((d) => d.value), [1, 0, 0, 0, 0, 0, 0]);
check("gym: by tonight the pace is 4 × 4/7", g.pace, 2.3);
check("gym line", describe(g), "Gimnasio: 1 de 4, quedan 4 días, vas por detrás");

const c = standing(cardio, sessions, [], thu);
check("km: run and bike add up, last week left out", c.done, 29.7);
check("km: 29.7 of 40 by Thursday is on pace", c.status, "on-pace");
check("km: per day", c.days.map((d) => d.value), [0, 21.5, 8.2, 0, 0, 0, 0]);
check("km line, Spanish decimals", describe(c), "Correr o bici: 29,7 km de 40 km, quedan 4 días, vas bien");
check("brief: on pace, just the count", brief(c), "Correr o bici: 29,7 km de 40 km");
check("count: what is left, the unit once", countOf(c), "faltan 10,3 km");
check("count: sessions left", countOf(g), "faltan 3");
check("brief: behind, it says so", brief(g), "Gimnasio: 1 de 4, quedan 4 días, vas por detrás");

const sat = at("2026-10-17T10:00:00Z");
check("gym: 1 of 4 on Saturday cannot be done", describe(standing(gym, sessions, [], sat)), "Gimnasio: 1 de 4, quedan 2 días, ya no da para todas");

const daily: Commitment = { id: 3, title: "Andar 30 min", activities: ["run"], metric: "minutes", target: 30, period: "day", proof: "auto" };
check("daily, nothing today: pending", standing(daily, sessions, [], thu).status, "pending");

// Habits: nothing arrives on its own, he ticks them (a photo he sends counts too).
const pill: Commitment = { id: 4, title: "Pastilla", activities: [], metric: "sessions", target: 1, period: "day", proof: "photo" };
const tick = (day: string, photo = true) => ({ day, commitmentId: 4, photo });
const p = standing(pill, sessions, [tick("2026-10-12"), tick("2026-10-13"), tick("2026-10-14"), tick("2026-10-15")], thu);
check("pill taken today: done, a 4-day streak", [p.status, p.streak], ["done", 4]);
check("pill: the week shows the photo days", p.days.map((d) => d.by), ["photo", "photo", "photo", "photo", null, null, null]);
check("pill line", describe(p), "Pastilla, hecho hoy, 4 días seguidos");
check("brief: a habit done, its name", brief(p), "Pastilla");
check("count: a once-a-day habit has none", countOf(p), null);
check("kind: a habit is its name", kindOf(pill), "Pastilla");
check("kind: a training has none, its activity draws it", kindOf(gym), null);
const notYet = standing(pill, sessions, [tick("2026-10-13"), tick("2026-10-14")], thu);
check("not yet today: the streak up to yesterday still counts", [notYet.status, notYet.streak], ["pending", 2]);
check("an old photo habit is ticked in the panel too", p.tickable, true);
check("another commitment's checks are not mine", standing(pill, sessions, [{ day: "2026-10-15", commitmentId: 9, photo: true }], thu).doneToday, false);

const ticked = standing(gym, sessions, [{ day: "2026-10-14", commitmentId: 1, photo: false }], thu);
check("gym without WHOOP, ticked in the panel: one more", [ticked.done, ticked.days[2]!.by], [2, "check"]);
check("a tick on a day WHOOP already has adds nothing", standing(gym, sessions, [{ day: "2026-10-12", commitmentId: 1, photo: false }], thu).done, 1);
check("a tick cannot say km", standing(cardio, sessions, [{ day: "2026-10-15", commitmentId: 2, photo: false }], thu).done, 29.7);
check("training is never ticked: it is told to the chat", [g.tickable, standing(cardio, sessions, [], thu).tickable], [false, false]);

const all = [g, c];
check("nudge at 19:00 when behind", nudgeDue(thu, all, new Set()), { kind: "commitments", day: "2026-10-15" });
check("never twice a day", nudgeDue(thu, all, new Set(["commitments:2026-10-15"])), null);
check("not at 17:00", nudgeDue(at("2026-10-15T15:00:00Z"), all, new Set()), null);
check(
  "not when today's is already done",
  nudgeDue(thu, [standing(gym, [...sessions, s("2026-10-15T07:00:00Z", "gym")], [], thu)], new Set()),
  null,
);
const night = standing({ ...pill, title: "Rutina de noche", proof: "check" }, sessions, [], thu);

// «Antes de entrenar»: gym on Monday, a run on Wednesday, nothing on Tuesday nor today (Thursday).
const creatine: Commitment = { ...pill, id: 5, title: "Antes de entrenar", proof: "check" };
const trained = [s("2026-10-12T16:00:00Z", "gym"), s("2026-10-14T06:00:00Z", "run")];
const took = (day: string) => ({ day, commitmentId: 5, photo: false });
const rest = standing(creatine, trained, [took("2026-10-12"), took("2026-10-14")], thu);
check("before training: a rest day asks nothing", rest.status, "on-pace");
check("before training: rest days do not break the streak", rest.streak, 2);
check("before training: trained today, it asks", standing(creatine, [...trained, s("2026-10-15T07:00:00Z", "gym")], [], thu).status, "pending");
check("before training: a training day without it breaks it", standing(creatine, trained, [took("2026-10-12")], thu).streak, 0);
check("a routine still to do at 19:00 never nudges", nudgeDue(thu, [night], new Set()), null);

check(
  "free windows around meetings",
  freeWindows("2026-10-15", [
    { start: at("2026-10-15T07:00:00Z"), end: at("2026-10-15T12:30:00Z") }, // 09:00-14:30
    { start: at("2026-10-15T13:00:00Z"), end: at("2026-10-15T16:00:00Z") }, // 15:00-18:00
  ]),
  ["07:00-09:00", "18:00-22:00"],
);
check(
  "a 30-minute gap is not a window",
  freeWindows("2026-10-15", [
    { start: at("2026-10-15T05:00:00Z"), end: at("2026-10-15T11:00:00Z") },
    { start: at("2026-10-15T11:30:00Z"), end: at("2026-10-15T19:30:00Z") },
  ]),
  [],
);

// — bedtime: "never later than 01:00", read from WHOOP's nights —
const bed: Commitment = { id: 5, title: "Dormir", activities: ["sleep"], metric: "bedtime", target: 60, period: "day", proof: "auto" };
// Madrid is UTC+2 in October: 22:40Z is 00:40 local.
check("00:40 on Tuesday is Monday's night", bedtimeOf(at("2026-10-12T22:40:00Z")), { day: "2026-10-12", clock: 40 });
check("23:30 is that same evening", bedtimeOf(at("2026-10-13T21:30:00Z")), { day: "2026-10-13", clock: 1410 });
const nights = [
  bedtimeOf(at("2026-10-11T22:50:00Z")), // Sun 00:50, in
  bedtimeOf(at("2026-10-12T22:40:00Z")), // Mon 00:40, in
  bedtimeOf(at("2026-10-13T21:30:00Z")), // Tue 23:30, in
  bedtimeOf(at("2026-10-14T23:45:00Z")), // Wed 01:45, out
];
const b = standing(bed, [], [], at("2026-10-15T17:00:00Z"), nights);
check("bedtime: the week's nights in and out, tonight still to come", b.days.map((d) => d.value), [1, 1, 0, 0, 0, 0, 0]);
check("bedtime: Wednesday late is marked, not empty", b.days[2]!.by, "auto");
check("bedtime: last night late is behind, and never tickable", [b.status, b.tickable, b.streak], ["behind", false, 0]);
check("bedtime line", describe(b), "Dormir: no más tarde de la 01:00, anoche te pasaste: a la 01:45");
check("count: a bedtime is its cap", countOf(b), "hasta la 01:00");
const b2 = standing(bed, [], [], at("2026-10-14T17:00:00Z"), nights);
check("bedtime: three good nights in a row (Sunday's counts too)", [b2.status, b2.streak], ["on-pace", 3]);
check("bedtime: no nudge is a day 'done' for it", b2.doneToday, false);
check("bedtime: 00:00 is a real target (23:30 in, 00:40 out)", standing({ ...bed, target: 0 }, [], [], at("2026-10-14T17:00:00Z"), nights).streak, 1);

// — water: «2 litros al día», from what he says he drank —
const water: Commitment = { id: 6, title: "Agua", activities: ["water"], metric: "liters", target: 2, period: "day", proof: "auto" };
const drinks = [
  { at: at("2026-10-14T08:00:00Z"), liters: 1.5 },
  { at: at("2026-10-14T15:00:00Z"), liters: 0.5 },
  { at: at("2026-10-15T07:30:00Z"), liters: 0.25 },
  { at: at("2026-10-15T12:00:00Z"), liters: 0.5 },
];
const w = standing(water, sessions, [{ day: "2026-10-15", commitmentId: 6, photo: false }], thu, [], drinks);
check("water: today's glasses add up, a tick adds nothing", [w.done, w.left, w.status], [0.8, 1.2, "pending"]);
check("water: one glass is not the day done", w.doneToday, false);
check("water: the week drawn in litres, yesterday's 2 L met", w.days.map((d) => d.value), [0, 0, 2, 0.8, 0, 0, 0]);
check("water: yesterday met, so a streak of 1 up to it", w.streak, 1);
check("water line", describe(w), "Agua: 0,8 L de 2 L hoy, pendiente");
check("water count", countOf(w), "faltan 1,2 L");
check("water: never ticked, never by a training", [w.tickable, standing(water, sessions, [], thu).done], [false, 0]);
check("water: nothing told is not 0 litres", describe(standing(water, sessions, [], thu)), "Agua: 2 L hoy, nada apuntado aún");
check("water: 2 L in, done", standing(water, [], [], thu, [], [...drinks, { at: at("2026-10-15T16:00:00Z"), liters: 1.25 }]).doneToday, true);
check("water: keeps the icon drawn for «Agua»", kindOf({ ...water, title: "Hidratación" }), "Agua");
check("water behind at 19:00 nudges", nudgeDue(thu, [w], new Set()), { kind: "commitments", day: "2026-10-15" });

check("ticked routines: one line, not «Hecho. En ayunas.»", tickedLine(["En ayunas", "Media mañana"]), "Marcado: en ayunas y media mañana.");
check("ticked routines: none, no line", tickedLine([]), null);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
