import { kindKey } from "~/lib/renders";

/**
 * What each training works, muscle by muscle, so the body map shows what he
 * really did (Javier, 18-oct-2026: «bastante más realista… sea de andar, sea
 * de lo que sea»).
 *
 * The unit is the weekly set, the one the hypertrophy evidence counts in
 * (Schoenfeld 2017: 10 or more weekly sets per muscle grow it most). An
 * exercise gives each set to its muscles by role: 1 the one it is for, 0.5
 * the ones that help, 0.25 the ones that hold. A sport counts by time: what
 * 30 minutes of it gives each muscle, in sets. Matched by name, so what he
 * already logged counts too.
 */
export const ZONES = [
  "pecho",
  "hombros",
  "trapecio",
  "espalda",
  "lumbares",
  "biceps",
  "triceps",
  "antebrazos",
  "abdomen",
  "oblicuos",
  "gluteos",
  "cuadriceps",
  "isquios",
  "aductores",
  "gemelos",
  "tibial",
] as const;
export type Zone = (typeof ZONES)[number];

export const ZONE_LABEL: Record<Zone, string> = {
  pecho: "Pecho",
  hombros: "Hombros",
  trapecio: "Trapecio",
  espalda: "Dorsales",
  lumbares: "Lumbares",
  biceps: "Bíceps",
  triceps: "Tríceps",
  antebrazos: "Antebrazos",
  abdomen: "Abdomen",
  oblicuos: "Oblicuos",
  gluteos: "Glúteos",
  cuadriceps: "Cuádriceps",
  isquios: "Isquios",
  aductores: "Aductores",
  gemelos: "Gemelos",
  tibial: "Tibial",
};

export type Work = Partial<Record<Zone, number>>;

export interface Exercise {
  name: string;
  /** Sets each muscle gets from one set. */
  work: Work;
  /** Words in his name for it, without accents, lowercase. */
  match: string[];
}

/** The first that matches wins, so the specific ones go first. */
export const EXERCISES: Exercise[] = [
  { name: "Press inclinado", work: { pecho: 1, hombros: 0.75, triceps: 0.5 }, match: ["inclinado"] },
  { name: "Press banca", work: { pecho: 1, triceps: 0.5, hombros: 0.5 }, match: ["press banca", "press de banca", "bench", "banca"] },
  { name: "Aperturas", work: { pecho: 1, hombros: 0.25 }, match: ["aperturas", "contractor", "pec deck", "cruce de poleas", "cruces"] },
  { name: "Fondos", work: { triceps: 1, pecho: 0.75, hombros: 0.5 }, match: ["fondos", "dips"] },
  { name: "Flexiones", work: { pecho: 1, triceps: 0.5, hombros: 0.5, abdomen: 0.25 }, match: ["flexiones", "push up", "pushup"] },
  { name: "Press militar", work: { hombros: 1, triceps: 0.5, trapecio: 0.25, abdomen: 0.25 }, match: ["press militar", "militar", "press hombro", "overhead", "arnold"] },
  { name: "Pájaros", work: { hombros: 1, trapecio: 0.5, espalda: 0.25 }, match: ["pajaros", "face pull", "posterior", "reverse fly"] },
  { name: "Elevaciones laterales", work: { hombros: 1, trapecio: 0.25 }, match: ["laterales", "elevaciones frontales", "elevaciones con mancuernas"] },
  { name: "Encogimientos", work: { trapecio: 1, antebrazos: 0.25 }, match: ["encogimientos", "shrug", "trapecio"] },
  { name: "Dominadas", work: { espalda: 1, biceps: 0.5, antebrazos: 0.5, hombros: 0.25, abdomen: 0.25 }, match: ["dominadas", "pull up", "pullup", "chin up"] },
  { name: "Jalón", work: { espalda: 1, biceps: 0.5, antebrazos: 0.25 }, match: ["jalon", "lat pulldown", "pulldown"] },
  { name: "Remo", work: { espalda: 1, trapecio: 0.5, biceps: 0.5, hombros: 0.25, lumbares: 0.25, antebrazos: 0.25 }, match: ["remo", "row"] },
  { name: "Peso muerto rumano", work: { isquios: 1, gluteos: 0.75, lumbares: 0.5, aductores: 0.25, antebrazos: 0.25 }, match: ["rumano", "rdl", "piernas rigidas"] },
  { name: "Peso muerto", work: { gluteos: 1, lumbares: 1, isquios: 0.75, cuadriceps: 0.5, espalda: 0.5, trapecio: 0.5, antebrazos: 0.5, aductores: 0.5 }, match: ["peso muerto", "deadlift"] },
  { name: "Hiperextensiones", work: { lumbares: 1, gluteos: 0.5, isquios: 0.5 }, match: ["hiperextension", "lumbar", "good morning", "buenos dias"] },
  { name: "Curl femoral", work: { isquios: 1, gemelos: 0.25 }, match: ["femoral", "leg curl"] },
  { name: "Curl", work: { biceps: 1, antebrazos: 0.5 }, match: ["curl", "biceps", "martillo"] },
  { name: "Tríceps", work: { triceps: 1 }, match: ["triceps", "press frances", "extension de triceps", "polea triceps"] },
  { name: "Antebrazos", work: { antebrazos: 1 }, match: ["antebrazo", "muneca", "farmer", "granjero"] },
  { name: "Zancadas", work: { cuadriceps: 1, gluteos: 1, aductores: 0.5, isquios: 0.25 }, match: ["zancada", "lunge", "bulgara", "split squat", "step up"] },
  { name: "Sentadilla", work: { cuadriceps: 1, gluteos: 1, aductores: 0.5, lumbares: 0.25, abdomen: 0.25 }, match: ["sentadilla", "squat", "goblet", "hack"] },
  { name: "Prensa", work: { cuadriceps: 1, gluteos: 0.5, aductores: 0.25 }, match: ["prensa", "leg press"] },
  { name: "Extensión de cuádriceps", work: { cuadriceps: 1 }, match: ["extension de cuadriceps", "extension de pierna", "leg extension", "cuadriceps"] },
  { name: "Aductores", work: { aductores: 1 }, match: ["aductor"] },
  { name: "Abductores", work: { gluteos: 1 }, match: ["abductor"] },
  { name: "Hip thrust", work: { gluteos: 1, isquios: 0.5, aductores: 0.25 }, match: ["hip thrust", "puente de gluteo", "gluteo"] },
  { name: "Gemelos", work: { gemelos: 1 }, match: ["gemelo", "calf", "pantorrilla"] },
  { name: "Oblicuos", work: { oblicuos: 1, abdomen: 0.5 }, match: ["oblicuo", "russian twist", "lenador", "pallof", "plancha lateral"] },
  { name: "Abdominales", work: { abdomen: 1, oblicuos: 0.5 }, match: ["abdominal", "plancha", "crunch", "rueda", "elevacion de piernas", "elevaciones de piernas", "core"] },
];

export interface Sport {
  name: string;
  /** Sets each muscle gets from 30 minutes of it. */
  work: Work;
  /** Minutes a km takes him, when only the distance was said. */
  minPerKm: number | null;
  /** In what he says, without accents. */
  match: string[];
  /** WHOOP's sport_name. */
  whoop: string[];
}

export const SPORTS: Sport[] = [
  { name: "Correr", work: { cuadriceps: 1, gemelos: 1, gluteos: 0.75, isquios: 0.75, tibial: 0.5, aductores: 0.25, abdomen: 0.25 }, minPerKm: 6, match: ["correr", "corrido", "carrera", "running", "trote"], whoop: ["running", "track-and-field"] },
  { name: "Bici", work: { cuadriceps: 1, gluteos: 0.75, gemelos: 0.5, isquios: 0.5, tibial: 0.25 }, minPerKm: 2.5, match: ["bici", "bicicleta", "ciclismo", "spinning", "rodillo"], whoop: ["cycling", "mountain-biking", "spin"] },
  { name: "Andar", work: { gemelos: 0.5, tibial: 0.5, cuadriceps: 0.25, gluteos: 0.25, isquios: 0.25 }, minPerKm: 12, match: ["andar", "caminar", "paseo", "pasear", "senderismo", "ruta"], whoop: ["walking", "race-walking", "hiking-rucking", "hiking"] },
  { name: "Nadar", work: { espalda: 1, hombros: 1, triceps: 0.5, pecho: 0.5, abdomen: 0.25 }, minPerKm: 25, match: ["nadar", "natacion", "piscina", "nado"], whoop: ["swimming"] },
  { name: "Pádel", work: { hombros: 0.75, antebrazos: 0.75, oblicuos: 0.5, cuadriceps: 0.5, gemelos: 0.5, gluteos: 0.25 }, minPerKm: null, match: ["padel", "tenis"], whoop: ["padel", "tennis", "squash"] },
  { name: "Fútbol", work: { cuadriceps: 0.75, isquios: 0.75, gemelos: 0.75, aductores: 0.5, gluteos: 0.5 }, minPerKm: null, match: ["futbol", "partido", "pachanga"], whoop: ["soccer"] },
  { name: "Esquí", work: { cuadriceps: 1, gluteos: 0.5, aductores: 0.5, abdomen: 0.25 }, minPerKm: null, match: ["esqui", "esquiar", "snow"], whoop: ["skiing", "snowboarding"] },
  { name: "Escalada", work: { antebrazos: 1, espalda: 1, biceps: 0.5, hombros: 0.25 }, minPerKm: null, match: ["escalada", "escalar", "boulder", "rocodromo"], whoop: ["climbing", "rock-climbing"] },
  { name: "Remo", work: { espalda: 1, cuadriceps: 0.75, gluteos: 0.5, biceps: 0.25, isquios: 0.25 }, minPerKm: 5, match: ["remoergometro", "piragua", "kayak"], whoop: ["rowing"] },
];

/** «Gimnasio: pierna», «torso»: a session told without its exercises still says where. */
const WORDS: [string, Zone[]][] = [
  ["pierna", ["cuadriceps", "gluteos", "isquios", "aductores", "gemelos"]],
  ["torso", ["pecho", "espalda", "hombros", "triceps", "biceps"]],
  ["empuje", ["pecho", "hombros", "triceps"]],
  ["push", ["pecho", "hombros", "triceps"]],
  ["tiron", ["espalda", "biceps", "trapecio"]],
  ["pull", ["espalda", "biceps", "trapecio"]],
  ["brazo", ["biceps", "triceps", "antebrazos"]],
  ["pecho", ["pecho"]],
  ["espalda", ["espalda", "trapecio"]],
  ["hombro", ["hombros"]],
  ["gluteo", ["gluteos"]],
  ["abdomen", ["abdomen", "oblicuos"]],
  ["core", ["abdomen", "oblicuos"]],
  ["full body", ["pecho", "espalda", "hombros", "cuadriceps", "gluteos"]],
  ["cuerpo entero", ["pecho", "espalda", "hombros", "cuadriceps", "gluteos"]],
];

const plain = (s: string) => ` ${kindKey(s).replace(/-/g, " ")} `;
const has = (text: string, word: string) => text.includes(` ${word}`);

/** The catalog entry for a name he gave, or null. */
export function exerciseOf(name: string): Exercise | null {
  const text = plain(name);
  return EXERCISES.find((e) => e.match.some((m) => has(text, m))) ?? null;
}

/**
 * The name it is shown and drawn under: the catalog's for a plain synonym
 * («press de banca», «sentadillas»); a variant keeps its own («Sentadilla
 * isométrica en pared», «Plancha de oso»): another movement, another drawing,
 * still counted with the catalog's muscles.
 */
export function exerciseName(name: string): string {
  const e = exerciseOf(name);
  const t = plain(name).trim();
  const same = (w: string) => t === w || t === `${w}s` || t === `${w}es`;
  return e && (same(plain(e.name).trim()) || e.match.some(same)) ? e.name : name.trim();
}

/** The sport in what he said («Correr 6 km», «Bici: 21,5 km») or in WHOOP's name. */
export function sportOf(text: string): Sport | null {
  const t = plain(text);
  return SPORTS.find((s) => s.whoop.includes(text) || s.match.some((m) => has(t, m))) ?? null;
}

/** The zones a line of text names: «Gimnasio: pierna» → legs. */
export function zonesIn(text: string): Zone[] {
  const t = plain(text);
  return [...new Set(WORDS.flatMap(([w, z]) => (has(t, w) ? z : [])))];
}
