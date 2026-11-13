import type { FactData } from "~/db/schema";
import { minutesIn, setsOf, setsText, summarize, type Session, type TrainingFact } from "./summary";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

/** A session's lines as they read: name and text. */
const read = (s: Session) => s.lines.map(({ name, text }) => ({ name, text }));
const gym = (day: string, exercises: FactData["exercises"], summary = "Gimnasio"): TrainingFact => ({ day, summary, data: { training: "gym", exercises } });

check("same sets together", setsText([{ name: "Press banca", sets: 3, reps: 8, weightKg: 80 }]), "3×8 · 80 kg");
check("a video per set adds up", setsText([1, 2, 3].map(() => ({ name: "Sentadilla", sets: 1, reps: 6, weightKg: 100 }))), "3×6 · 100 kg");
check("ramped sets one by one", setsText([{ name: "Press banca", sets: 1, reps: 8, weightKg: 80 }, { name: "Press banca", sets: 1, reps: 6, weightKg: 85 }, { name: "Press banca", sets: 1, reps: 4, weightKg: 87.5 }]), "80 kg ×8 · 85 kg ×6 · 87,5 kg ×4");
check("bodyweight", setsText([{ name: "Dominadas", sets: 4, reps: 10 }]), "4×10");
check("a hold, by seconds", setsText([{ name: "Sentadilla isométrica en pared", sets: 3, seconds: 30 }]), "3×30 s");
check("holds of different lengths", setsText([{ name: "Plancha", sets: 1, seconds: 30 }, { name: "Plancha", sets: 1, seconds: 45 }]), "30 s · 45 s");
check("no reps said", setsText([{ name: "Remo", sets: 3, weightKg: 60 }]), "3 series · 60 kg");
check("pills: one per set", setsOf([{ name: "Press banca", sets: 2, reps: 8, weightKg: 80 }, { name: "Press banca", sets: 1, reps: 6, weightKg: 85 }]), ["80 kg ×8", "80 kg ×8", "85 kg ×6"]);
check("pills: holds and bodyweight", setsOf([{ name: "Sentadilla isométrica en pared", sets: 2, seconds: 45 }, { name: "Zancada", sets: 1, reps: 10 }]), ["45 s", "45 s", "×10"]);
check("pills: nothing to say per set", setsOf([{ name: "Oso a pica", sets: 3 }]), []);

const t = summarize(
  [
    gym("2026-08-20", [{ name: "Press de banca", sets: 3, reps: 8, weightKg: 70 }]),
    gym("2026-10-09", [{ name: "Press banca", sets: 3, reps: 8, weightKg: 75 }]),
    gym("2026-10-12", [], "Gimnasio: pierna"),
    gym("2026-10-16", [{ name: "press banca", sets: 1, reps: 8, weightKg: 80 }, { name: "Press banca", sets: 1, reps: 5, weightKg: 85 }, { name: "Dominadas", sets: 3, reps: 8 }]),
    { day: "2026-10-17", summary: "Correr 6 km", data: { training: "run", distanceKm: 6 } },
  ],
  "2026-10-18",
);
check("newest session first", t.sessions.map((s) => s.day), ["2026-10-17", "2026-10-16", "2026-10-12", "2026-10-09", "2026-08-20"]);
check("one line per exercise, names merged", read(t.sessions[1]!), [{ name: "Press banca", text: "80 kg ×8 · 85 kg ×5" }, { name: "Dominadas", text: "3×8" }]);
check("a leg day told in words", t.sessions[2]!.said, ["Gimnasio: pierna"]);
check("a run becomes a line", [read(t.sessions[0]!), t.sessions[0]!.said], [[{ name: "Correr", text: "6 km" }], []]);

const round = (n: number | undefined) => (n === undefined ? n : Math.round(n * 100) / 100);
const zone = (tr: typeof t, z: string) => tr.zones.find((x) => x.zone === z)!;
check("chest: two sets of bench", [zone(t, "pecho").sets, zone(t, "pecho").last], [2, "2026-10-16"]);
check("lats: three pull-ups", zone(t, "espalda").sets, 3);
check("biceps: helping, half", zone(t, "biceps").sets, 1.5);
check("quads: the leg day and 36 min of running", zone(t, "cuadriceps").from.map((p) => [p.label, round(p.sets)]), [["Gimnasio: pierna", 3], ["Correr", 1.2]]);
check("shins: only the run", round(zone(t, "tibial").sets), 0.6);
check("lower back: never", [zone(t, "lumbares").sets, zone(t, "lumbares").last], [0, null]);
check("outside the week counts for last, not sets", [zone(t, "triceps").sets, zone(t, "triceps").last], [1, "2026-10-16"]);
check("what is left in the muscle fades by the day", [round(zone(t, "pecho").fatigue), round(zone(t, "cuadriceps").fatigue), zone(t, "lumbares").fatigue], [0.8, 0.84, 0]);
check("nothing loaded: the group that waited longest", t.next, { title: "Hoy toca pecho y hombros", detail: "Última vez hace 2 días" });
const benchToday = summarize([gym("2026-10-18", [{ name: "Press banca", sets: 4, reps: 8, weightKg: 80 }])], "2026-10-18");
check("trained today: tomorrow, with tomorrow's fatigue", benchToday.next, { title: "Mañana toca pierna", detail: "Sin entrenar aún" });

const bench = t.lifts.find((l) => l.name === "Press banca");
check("bench: heaviest set of each day", bench?.points.map((p) => p.kg), [70, 75, 85]);
check("bench: change within eight weeks", bench?.change, 10);
check("bench: the day's sets ride along", bench?.points.at(-1)?.sets, "80 kg ×8 · 85 kg ×5");
check("no weight, no lift", t.lifts.some((l) => l.name === "Dominadas"), false);

check("minutes said", ["Andar 45 min", "Pádel 1 h", "Bici 1,5 horas", "hora y media de paseo", "Correr 6 km"].map(minutesIn), [45, 60, 90, 90, null]);
const walk = summarize([{ day: "2026-10-17", summary: "Andar 90 min", data: { training: "other" } }], "2026-10-18");
check("a walk said in minutes", [read(walk.sessions[0]!), zone(walk, "gemelos").sets], [[{ name: "Andar", text: "90 min" }], 1.5]);

// Learned from the web: an exercise the catalog lacks, and a new sport by time.
const swing = { key: "kettlebell-swing", name: "Kettlebell swing", byTime: false, work: { gluteos: 1, isquios: 1 }, how: "Balanceas la pesa con la cadera.", drawn: true };
const yoga = { key: "yoga", name: "Yoga", byTime: true, work: { abdomen: 0.5 }, how: null, drawn: false };
const learning = { key: "clean-and-jerk", name: "Clean and jerk", byTime: false, work: null, how: null, drawn: false };
const l = summarize(
  [
    gym("2026-10-17", [{ name: "Kettlebell swing", sets: 4, reps: 15, weightKg: 24 }, { name: "Clean and jerk", sets: 3, reps: 2, weightKg: 60 }]),
    { day: "2026-10-16", summary: "Yoga 60 min", data: { training: "other", kind: "yoga" } },
  ],
  "2026-10-18",
  [],
  [swing, yoga, learning],
);
check("a learned exercise counts", zone(l, "gluteos").from, [{ label: "Kettlebell swing", sets: 4 }]);
check("one still being learned says so", l.sessions[0]!.lines.map((x) => x.learning ?? false), [false, true]);
check("a learned sport, by its minutes", [read(l.sessions[1]!), zone(l, "abdomen").sets], [[{ name: "Yoga", text: "60 min" }], 1]);
check("its drawing rides on the lift", l.lifts.find((x) => x.name === "Kettlebell swing")?.move?.key, "kettlebell-swing");

// WHOOP: it brings the minutes; what he said brings the km. No double count.
const w = summarize(
  [{ day: "2026-10-17", summary: "Correr 6 km", data: { training: "run", distanceKm: 6 } }],
  "2026-10-18",
  [
    { day: "2026-10-17", sport: "running", minutes: 30 },
    { day: "2026-10-15", sport: "walking", minutes: 60 },
    { day: "2026-10-14", sport: "weightlifting", minutes: 45 },
    { day: "2026-10-13", sport: "swimming", minutes: 319 },
    { day: "2026-10-12", sport: "activity", minutes: 40 },
  ],
);
check("whoop days", w.sessions.map((s) => [s.day, read(s)]), [
  ["2026-10-17", [{ name: "Correr", text: "6 km · 30 min" }]],
  ["2026-10-15", [{ name: "Andar", text: "60 min" }]],
  ["2026-10-14", [{ name: "Pesas", text: "45 min" }]],
  ["2026-10-13", [{ name: "Nadar", text: "319 min" }]],
]);
check("minutes: WHOOP's, capped at two hours", w.sessions.map((s) => s.minutes), [30, 60, 45, 120]);
check("WHOOP's weights are by time", w.sessions[2]!.lines[0]!.sport, true);
check("minutes he said, without WHOOP", l.sessions[1]!.minutes, 60);
check("no minutes, none made up", t.sessions[1]!.minutes, null);
const r = summarize([{ day: "2026-10-21", summary: "Pierna", data: { training: "gym", routineId: 2, exercises: [{ name: "Oso a pica" }] } }], "2026-10-22", [], [swing]);
check("the routine it belongs to", [r.sessions[0]!.routineId, t.sessions[0]!.routineId], [2, null]);
check("its drawing rides on the line", l.sessions[0]!.lines[0]!.move?.key, "kettlebell-swing");
check("a run counted once, by its minutes", zone(w, "cuadriceps").from.map((p) => [p.label, round(p.sets)]), [["Correr", 1], ["Andar", 0.5]]);
check("an hour walking: calves", zone(w, "gemelos").from.map((p) => [p.label, p.sets]), [["Correr", 1], ["Andar", 1]]);
check("weights without detail: no muscles", w.zones.some((z) => z.from.some((p) => p.label === "Pesas")), false);
check("a forgotten swim stops at two hours", zone(w, "espalda").sets, 4);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`training: ${passed} passed`);
