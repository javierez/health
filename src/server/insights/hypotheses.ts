import { z } from "zod";

import type { Candidate } from "./candidates";
import type { Day } from "./days";

/**
 * What an AI hypothesis may say: a split of his days over the measures the
 * engine already has, or over words in the day (a person, a place, a topic).
 * Nothing else, so every idea it has is testable and none is taken on its
 * word. Pure: `propose.ts` asks, `queries/hypotheses.ts` loads.
 */
export const FIELDS = {
  bed: "hora de acostarse en minutos desde mediodía (00:00 = 1440, 01:30 = 1530)",
  slept: "minutos dormidos esa noche",
  debt: "noches de menos de 6 h entre esa y las dos anteriores (0 a 3)",
  weekday: "día de la semana de esa tarde (1 lunes … 7 domingo)",
  trained: "entrenó ese día (0 o 1)",
  strength: "hizo pesas (0 o 1)",
  cardio: "hizo cardio (0 o 1)",
  lateWorkout: "entrenó después de las 20:30 (0 o 1)",
  strain: "strain de WHOOP de ese día (0 a 21)",
  lines: "sus líneas de código ese día",
  lateCode: "hizo un commit entre las 00:00 y las 06:00 (0 o 1)",
  sent: "mensajes de WhatsApp que envió",
  lateSent: "mensajes que envió entre las 23:00 y las 04:00",
  chats: "chats de WhatsApp en los que escribió",
  phoneToBed: "minutos entre su último WhatsApp y acostarse (negativo: escribió ya en la cama)",
  tenseChats: "conversaciones tensas o malas ese día, por WhatsApp o en persona (Pocket)",
  business: "minutos de reuniones y llamadas de trabajo que oyó Pocket",
  social: "minutos de charla social que oyó Pocket",
  family: "minutos con su pareja o su familia que oyó Pocket",
  friends: "minutos con amigos que oyó Pocket",
  bedShift: "minutos entre la hora a la que se acostó y su hora habitual (mediana de las 7 noches antes), en valor absoluto",
  steps: "pasos de ese día (WHOOP)",
  moderateMin: "minutos de entreno en zonas 1 a 3",
  vigorousMin: "minutos de entreno en zonas 4 y 5",
  activeWeek: "minutos de cardio en los 7 días hasta ese (los de zonas 4-5 cuentan doble)",
  stress: "estrés de ese día según su pulso (0 a 3; solo desde que usa Edge)",
  alcohol: "bebió alcohol (0 o 1; solo los días que contó lo que comió)",
  caffeine: "tomó café (0 o 1; ídem)",
} as const;

export type Field = keyof typeof FIELDS;
const fieldKeys = Object.keys(FIELDS) as [Field, ...Field[]];

const cond = z.union([
  z.object({ field: z.enum(fieldKeys), op: z.enum([">=", "<=", "="]), value: z.number() }),
  /** A word in the day's WhatsApp summary and lines, or in what Pocket heard. */
  z.object({ mentions: z.string().trim().min(3).max(40) }),
]);
const todo = z.object({ verb: z.enum(["haz", "evita"]), action: z.string().trim().min(3).max(90) });

export const specSchema = z.object({
  title: z.string().trim().min(3).max(60),
  why: z.string().trim().min(3).max(200),
  labels: z.tuple([z.string().trim().min(1).max(40), z.string().trim().min(1).max(40)]),
  when: z.array(cond).min(1).max(3),
  /** «rest»: every other day with the measures known. */
  versus: z.union([z.literal("rest"), z.array(cond).min(1).max(3)]),
  good: todo,
  bad: todo,
  controllable: z.boolean(),
});

export type Spec = z.infer<typeof specSchema>;
type Cond = z.infer<typeof cond>;

/** At the start of a word: «tac» finds «tac» and «tacs», never «contacto». */
const startsWord = (text: string, term: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u").test(text);

/** True, false, or null when the day does not say. */
function holds(c: Cond, d: Day): boolean | null {
  if ("mentions" in c) return d.text === "" ? null : startsWord(d.text, c.mentions);
  const raw = d[c.field];
  if (raw === null) return null;
  const v = typeof raw === "boolean" ? Number(raw) : raw;
  return c.op === ">=" ? v >= c.value : c.op === "<=" ? v <= c.value : v === c.value;
}

function all(cs: Cond[], d: Day): boolean | null {
  const r = cs.map((c) => holds(c, d));
  return r.includes(false) ? false : r.includes(null) ? null : true;
}

export function toCandidate(id: number, spec: Spec): Candidate {
  return {
    key: `ai-${id}`,
    title: spec.title,
    labels: spec.labels,
    side: (d) => {
      const when = all(spec.when, d);
      if (when === null) return null;
      if (when) return true;
      return spec.versus === "rest" ? false : all(spec.versus, d) ? false : null;
    },
    // Unless it is about bed or sleep itself, at the same bedtime like the rest.
    adjust: ![...spec.when, ...(spec.versus === "rest" ? [] : spec.versus)].some((c) => "field" in c && (c.field === "bed" || c.field === "slept")),
    good: spec.good,
    bad: spec.bad,
    controllable: spec.controllable,
    why: spec.why,
  };
}
