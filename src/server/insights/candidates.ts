import { WA_TOPICS, type WaTopic } from "~/db/schema";
import type { NutrientKey } from "~/lib/food";
import { kindKey } from "~/lib/renders";
import { SOURCES, type Source } from "~/server/assistant/evidence";

import type { Day } from "./days";
import type { OutcomeKey } from "./outcomes";
import { quantile } from "./stats";

/**
 * Everything worth comparing, each a split of his days in two: the side
 * being judged (true) and the one it is compared with (false); null leaves
 * the day out. Every one is tried on every outcome (`outcomes.ts`); the
 * engine keeps what clears the noise. Free: no model reads these.
 */
export interface Todo {
  verb: "haz" | "evita";
  action: string;
}

/** About his conversations: what «Conversaciones» shows against his body. */
export const isConversation = (key: string) => /^(late-whatsapp|phone-to-bed|wa-heavy|tense-|topic-)/.test(key);

export interface Candidate {
  key: string;
  title: string;
  side: (d: Day) => boolean | null;
  labels: [string, string];
  /** Outcomes it cannot be judged on: sleeping 7 h does not «cause» sleeping 7 h. */
  skip?: OutcomeKey[];
  /** Compare only days with the same bedtime third. Off for what is about bed or sleep itself. */
  adjust: boolean;
  good: Todo;
  bad: Todo;
  source?: Source;
  /**
   * He can choose or avoid it day by day, so it can be a two-week experiment.
   * Only these are «te hace bien / mal» and count in the balance (Javier,
   * 18-oct-2026: «cosas que puedo evitar que pasen»), what he talks about and
   * how much WhatsApp too («de lo que hablo también se puede evitar… reducir
   * tiempos»). The rest happens to him (a Sunday, a day others made tense, a
   * symptom): it only goes with his nights, «va junto», never a cause.
   */
  controllable?: boolean;
  /** Why the AI proposed it (`hypotheses.ts`); hand-written ones have none. */
  why?: string;
}

const clock = (line: number) => {
  const m = line % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const num = (n: number) => Math.round(n).toLocaleString("es-ES");

/** His own lower and upper third of a measure, so «mucho» means much for him. */
function thirds(days: Day[], value: (d: Day) => number | null): [number, number] | null {
  const xs = days.flatMap((d) => {
    const v = value(d);
    return v === null ? [] : [v];
  });
  return xs.length >= 30 ? [quantile(xs, 1 / 3), quantile(xs, 2 / 3)] : null;
}

/** The high third against the low one. */
function high(value: (d: Day) => number | null, [lo, hi]: [number, number]) {
  return (d: Day) => {
    const v = value(d);
    return v === null ? null : v > hi ? true : v <= lo ? false : null;
  };
}

const TOPIC: Record<Exclude<WaTopic, "Otros">, string> = {
  Clientes: "clientes",
  Socio: "tu socio",
  Equipo: "el equipo",
  Familia: "la familia",
  Pareja: "tu pareja",
  Amigos: "los amigos",
  Dinero: "dinero",
  Salud: "salud",
};
const NUTRITION: { key: NutrientKey; title: string; unit: string; good: string; bad: string; source?: Source }[] = [
  { key: "kcal", title: "Días de comer mucho", unit: " kcal", good: "come a gusto: no te sienta mal", bad: "pasarte de cantidad, sobre todo en la cena" },
  { key: "proteinG", title: "Mucha proteína", unit: " g", good: "proteína en cada comida", bad: "cargar la cena de proteína", source: SOURCES.morton },
  { key: "carbsG", title: "Muchos hidratos", unit: " g", good: "los hidratos de esos días", bad: "los hidratos en la cena" },
  { key: "sugarG", title: "Mucho azúcar", unit: " g", good: "lo de siempre: el azúcar no te está pasando factura", bad: "el azúcar, sobre todo por la tarde" },
  { key: "fiberG", title: "Mucha fibra", unit: " g", good: "legumbre, verdura y fruta cada día", bad: "tanta fibra en la cena", source: SOURCES.reynolds },
  { key: "fatG", title: "Mucha grasa", unit: " g", good: "lo de siempre: la grasa no te está pasando factura", bad: "las cenas grasas" },
  { key: "saltG", title: "Mucha sal", unit: " g", good: "lo de siempre: la sal no te está pasando factura", bad: "la sal y los procesados" },
];

/** «de el equipo» → «del equipo», «a el» → «al». */
const contract = (text: string) => text.replace(/\b(de|a) el\b/g, (_, p: string) => (p === "de" ? "del" : "al"));

export function candidates(days: Day[]): Candidate[] {
  const out: Candidate[] = [];
  const add = (c: Candidate) => out.push(c);

  // Sleep and bed: compared raw, since bedtime is what the others are adjusted for.
  const bed = thirds(days, (d) => d.bed);
  if (bed) {
    const early = Math.floor(bed[0] / 30) * 30;
    const late = Math.ceil(bed[1] / 30) * 30;
    add({
      key: "bed-early",
      title: `Acostarte antes de las ${clock(early)}`,
      side: (d) => (d.bed === null ? null : d.bed <= early ? true : d.bed > late ? false : null),
      labels: [`Antes de las ${clock(early)}`, `Después de las ${clock(late)}`],
      adjust: false,
      good: { verb: "haz", action: `a la cama antes de las ${clock(early)}` },
      bad: { verb: "evita", action: `obligarte a acostarte antes de las ${clock(early)}` },
      source: SOURCES.windred,
      controllable: true,
    });
  }
  add({
    key: "short-sleep",
    controllable: true,
    title: "Dormir menos de 6 h",
    side: (d) => (d.slept === null ? null : d.slept < 360 ? true : d.slept >= 420 ? false : null),
    labels: ["Menos de 6 h", "7 h o más"],
    skip: ["sleep"],
    adjust: false,
    good: { verb: "haz", action: "lo que te funcione, aunque duermas poco" },
    bad: { verb: "haz", action: "si te acuestas tarde, retrasa la alarma" },
    source: SOURCES.aasm,
  });
  add({
    key: "sleep-debt",
    controllable: true,
    title: "Tres noches seguidas de menos de 6 h",
    side: (d) => (d.debt === null ? null : d.debt === 3 ? true : d.debt === 0 ? false : null),
    labels: ["Tres seguidas", "Ninguna corta"],
    skip: ["sleep"],
    adjust: false,
    good: { verb: "haz", action: "lo que te funcione" },
    bad: { verb: "evita", action: "encadenar noches cortas: tras dos, la tercera larga" },
    source: SOURCES.aasm,
  });

  // The week.
  add({
    key: "weekend",
        title: "Las noches de viernes y sábado",
    side: (d) => d.weekday === 5 || d.weekday === 6,
    labels: ["Viernes y sábado", "El resto"],
    adjust: true,
    good: { verb: "haz", action: "lo que haces el fin de semana, también entre semana" },
    bad: { verb: "haz", action: "prueba un viernes sin alcohol y lo comparamos" },
    source: SOURCES.ebrahim,
  });
  add({
    key: "sunday",
        title: "Los domingos por la noche",
    side: (d) => d.weekday === 7,
    labels: ["Domingo", "El resto"],
    adjust: true,
    good: { verb: "haz", action: "lo que haces los domingos" },
    bad: { verb: "haz", action: "deja el lunes preparado antes de la cena del domingo" },
  });

  // Training.
  const trainingTodo = {
    good: { verb: "haz" as const, action: "mantén los entrenos de la semana" },
    bad: { verb: "evita" as const, action: "entrenar fuerte la víspera de un día importante" },
    source: SOURCES.who,
  };
  add({ key: "trained", title: "Entrenar", side: (d) => d.trained, labels: ["Con entreno", "Sin entreno"], adjust: true, ...trainingTodo });
  add({
    key: "strength",
    controllable: true,
    title: "Hacer pesas",
    side: (d) => (d.strength ? true : d.trained === false ? false : null),
    labels: ["Con pesas", "Sin entreno"],
    adjust: true,
    ...trainingTodo,
    source: SOURCES.morton,
  });
  add({
    key: "cardio",
    controllable: true,
    title: "Hacer cardio",
    side: (d) => (d.cardio ? true : d.trained === false ? false : null),
    labels: ["Con cardio", "Sin entreno"],
    adjust: true,
    ...trainingTodo,
  });
  add({
    key: "late-workout",
    title: "Entrenar después de las 20:30",
    side: (d) => (!d.trained ? null : d.lateWorkout),
    labels: ["Tarde", "Antes"],
    adjust: true,
    good: { verb: "haz", action: "entrena a última hora si te cuadra" },
    bad: { verb: "evita", action: "entrenar después de las 20:30" },
    controllable: true,
  });
  const strain = thirds(days, (d) => d.strain);
  if (strain) {
    add({
      key: "high-strain",
      controllable: true,
      title: "Días de mucho esfuerzo",
      side: high((d) => d.strain, strain),
      labels: [`Strain de más de ${strain[1].toFixed(1)}`, `Hasta ${strain[0].toFixed(1)}`],
      adjust: true,
      good: { verb: "haz", action: "mantén los días intensos" },
      bad: { verb: "haz", action: "tras un día intenso, el siguiente suave" },
    });
  }

  // Work.
  const lines = thirds(days, (d) => d.lines);
  if (lines) {
    add({
      key: "code-heavy",
      controllable: true,
      title: "Días de mucho código",
      side: high((d) => d.lines, lines),
      labels: [`Más de ${num(lines[1])} líneas`, `Hasta ${num(lines[0])}`],
      skip: ["nextLines"],
      adjust: true,
      good: { verb: "haz", action: "lo que haces esos días" },
      bad: { verb: "evita", action: "alargar el código después de cenar" },
    });
  }
  add({
    key: "code-late",
    title: "Programar después de las 00:00",
    side: (d) => d.lateCode,
    labels: ["Con commit de madrugada", "Sin"],
    adjust: true,
    good: { verb: "haz", action: "programa de noche si te sale" },
    bad: { verb: "evita", action: "hacer commits después de las 00:00" },
    controllable: true,
  });
  add({
    key: "code-none",
    controllable: true,
    title: "Días sin programar",
    side: (d) => (d.lines === null ? null : d.lines === 0),
    labels: ["Sin código", "Con código"],
    skip: ["nextLines"],
    adjust: true,
    good: { verb: "haz", action: "un día a la semana sin código" },
    bad: { verb: "haz", action: "aunque sea poco, toca el código cada día" },
  });

  // Phone.
  add({
    key: "late-whatsapp",
    title: "Escribir por WhatsApp de noche",
    side: (d) => (d.lateSent === null ? null : d.lateSent >= 5 ? true : d.lateSent === 0 ? false : null),
    labels: ["5 o más después de las 23:00", "Ninguno"],
    adjust: true,
    good: { verb: "haz", action: "lo que te deje tranquilo antes de dormir" },
    bad: { verb: "evita", action: "el WhatsApp después de las 23:00" },
    controllable: true,
  });
  add({
    key: "phone-to-bed",
    title: "WhatsApp hasta meterte en la cama",
    side: (d) => (d.phoneToBed === null ? null : d.phoneToBed <= 15 ? true : d.phoneToBed >= 60 ? false : null),
    labels: ["Último mensaje a menos de 15 min", "Más de 1 h antes"],
    adjust: true,
    good: { verb: "haz", action: "lo que te funcione" },
    bad: { verb: "evita", action: "el móvil la última hora antes de dormir" },
    controllable: true,
  });
  const sent = thirds(days, (d) => d.sent);
  if (sent) {
    add({
      key: "wa-heavy",
      controllable: true,
            title: "Días de mucho WhatsApp",
      side: high((d) => d.sent, sent),
      labels: [`Más de ${num(sent[1])} mensajes`, `Hasta ${num(sent[0])}`],
      adjust: true,
      good: { verb: "haz", action: "lo que haces esos días" },
      bad: { verb: "haz", action: "agrupa los mensajes en dos ratos al día" },
    });
  }

  // His conversations as AI read them (WhatsApp and Pocket): tension, topics.
  add({
    key: "tense-day",
        title: "Días con varias conversaciones tensas",
    side: (d) => (d.tenseChats === null ? null : d.tenseChats >= 3 ? true : d.tenseChats <= 1 ? false : null),
    labels: ["3 o más tensas", "Ninguna o una"],
    adjust: true,
    good: { verb: "haz", action: "lo que haces esos días" },
    bad: { verb: "evita", action: "contestar lo de trabajo después de las 22:00" },
  });
  for (const t of WA_TOPICS) {
    if (t === "Otros") continue;
    const what = TOPIC[t];
    add({
      key: `topic-${t.toLowerCase()}`,
      controllable: true,
            title: contract(`Días que hablas de ${what}`),
      side: (d) => (d.topics === null ? null : d.topics.includes(t)),
      labels: [`Con ${what}`, `Sin ${what}`],
      adjust: true,
      good: { verb: "haz", action: contract(`dedica un rato a ${what} esta semana`) },
      bad: { verb: "evita", action: `${what} después de las 21:00` },
    });
    add({
      key: `tense-${t.toLowerCase()}`,
      controllable: true,
            title: `Tensión con ${what}`,
      side: (d) => (d.tenseTopics === null ? null : d.tenseTopics.includes(t) ? true : d.tenseChats === 0 ? false : null),
      labels: [`Tensión con ${what}`, "Ninguna tensión"],
      adjust: true,
      good: { verb: "haz", action: "no rehúyas esas conversaciones" },
      bad: { verb: "evita", action: `discutir de ${what} por la noche: déjalo para la mañana` },
    });
  }

  // What Pocket heard.
  add({
    key: "social",
    controllable: true,
    title: "Ver gente",
    side: (d) => (d.social === null ? null : d.social >= 30 ? true : d.social === 0 ? false : null),
    labels: ["30 min o más de charla", "Nada"],
    adjust: true,
    good: { verb: "haz", action: "queda con alguien esta semana" },
    bad: { verb: "evita", action: "alargar los planes entre semana" },
  });
  const business = thirds(days, (d) => d.business);
  if (business) {
    add({
      key: "business-heavy",
      controllable: true,
      title: "Días de muchas reuniones",
      side: high((d) => d.business, business),
      labels: [`Más de ${num(business[1])} min`, `Hasta ${num(business[0])} min`],
      adjust: true,
      good: { verb: "haz", action: "lo que haces esos días" },
      bad: { verb: "haz", action: "deja un hueco sin reuniones tras las largas" },
    });
  }

  // What he told the chat.
  add({
    key: "alcohol",
    title: "Beber",
    side: (d) => d.alcohol,
    labels: ["Con alcohol", "Sin alcohol"],
    adjust: true,
    good: { verb: "haz", action: "lo de siempre: no te está pasando factura" },
    bad: { verb: "evita", action: "el alcohol entre semana" },
    source: SOURCES.ebrahim,
    controllable: true,
  });
  add({
    key: "caffeine",
    title: "Tomar café",
    side: (d) => d.caffeine,
    labels: ["Con café", "Sin café"],
    adjust: true,
    good: { verb: "haz", action: "tu café de siempre" },
    bad: { verb: "evita", action: "el café después de comer" },
    source: SOURCES.drake,
    controllable: true,
  });
  add({
    key: "caffeine-late",
    title: "Café después de las 14:00",
    side: (d) => d.lateCaffeine,
    labels: ["Con café por la tarde", "Sin"],
    adjust: true,
    good: { verb: "haz", action: "tu café de la tarde" },
    bad: { verb: "evita", action: "el café después de las 14:00" },
    source: SOURCES.drake,
    controllable: true,
  });
  add({
    key: "alcohol-heavy",
    title: "Beber más de dos copas",
    side: (d) => (d.food === null ? null : d.food.alcoholG >= 24 ? true : d.food.alcoholG === 0 ? false : null),
    labels: ["Más de dos copas", "Nada"],
    adjust: true,
    good: { verb: "haz", action: "lo de siempre: no te está pasando factura" },
    bad: { verb: "evita", action: "pasar de una copa" },
    source: SOURCES.ebrahim,
    controllable: true,
  });
  add({
    key: "late-dinner",
    title: "Cenar a menos de 2 h de acostarte",
    side: (d) => (d.lastMeal === null ? null : d.lastMeal <= 120 ? true : d.lastMeal >= 180 ? false : null),
    labels: ["Menos de 2 h", "3 h o más"],
    adjust: true,
    good: { verb: "haz", action: "cena cuando te venga bien" },
    bad: { verb: "evita", action: "cenar a menos de 3 h de acostarte" },
    controllable: true,
  });

  // What he ate, on days with lunch and dinner told: his own high third against his low one.
  for (const n of NUTRITION) {
    const value = (d: Day) => d.food?.[n.key] ?? null;
    const cut = thirds(days, value);
    add({
      key: `food-${n.key}`,
      title: n.title,
      // Under 30 told days there are no thirds yet: it waits, and «Cómo te afecta» says so.
      side: cut ? high(value, cut) : () => null,
      labels: cut ? [`Más de ${num(cut[1])}${n.unit}`, `Hasta ${num(cut[0])}${n.unit}`] : ["Mucho", "Poco"],
      adjust: true,
      good: { verb: "haz", action: n.good },
      bad: { verb: "evita", action: n.bad },
      source: n.source,
      controllable: true,
    });
  }

  // What he takes, his habits and his own things: each judged from its first day, so the days before it do not count as without.
  const firstDays = (of: (d: Day) => string[]) => {
    const out = new Map<string, string>();
    for (const d of days) for (const name of of(d)) if (!out.has(name)) out.set(name, d.day);
    return out;
  };
  for (const [name, first] of firstDays((d) => d.products)) {
    add({
      key: `product-${kindKey(name)}`,
      title: `Días con ${name}`,
      side: (d) => (d.day < first ? null : d.products.includes(name)),
      labels: ["Lo tomas", "No lo tomas"],
      adjust: true,
      good: { verb: "haz", action: `sigue con ${name}` },
      bad: { verb: "evita", action: `${name} una semana y lo comparamos` },
      controllable: true,
    });
  }
  for (const [name, first] of firstDays((d) => d.did)) {
    add({
      key: `did-${kindKey(name)}`,
      title: name,
      side: (d) => (d.day < first ? null : d.did.includes(name)),
      labels: ["Lo haces", "No lo haces"],
      adjust: true,
      good: { verb: "haz", action: `sigue con «${name}»` },
      bad: { verb: "evita", action: `deja «${name}» una semana y lo comparamos` },
      controllable: true,
    });
  }
  // A symptom is not chosen: it says what comes with it (a headache and the night after), not a habit to try.
  for (const [name, first] of firstDays((d) => d.symptoms)) {
    add({
      key: `symptom-${kindKey(name)}`,
            title: `Días con «${name}»`,
      side: (d) => (d.day < first || d.symptom === null ? null : d.symptoms.includes(name)),
      labels: [`Con «${name}»`, "Sin síntomas"],
      skip: ["symptoms"],
      adjust: true,
      good: { verb: "haz", action: `lo de siempre: «${name}» no te está pasando factura` },
      bad: { verb: "haz", action: `los días con «${name}», acuéstate antes y entrena suave` },
    });
  }
  return out;
}
