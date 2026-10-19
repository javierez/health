import { z } from "zod";

import { ACTIVITIES, METRICS, PERIODS, PROOFS, type Activity, type Metric, type Period, type Proof } from "~/db/schema";
import { sinRayas } from "~/lib/sin-rayas";

/**
 * Commitments are made in the WhatsApp chat, typed or as a voice note: "esta
 * semana 4 de gimnasio", "40 km entre correr y bici", "la pastilla cada día,
 * te mando foto", "quita lo de correr". And the chat is also where a habit is
 * proven: "me la he tomado", or the photo. The chat's one tool call carries
 * both in `commitments` and `done`; this is those fields and their parser.
 * Applying them is `~/server/queries/commitments`.
 */
export const COMMITMENTS_FIELDS = {
  commitments: {
    type: "array",
    items: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["set", "stop"] },
        id: { type: "number", description: "The [id] of an existing one, to change or stop it." },
        title: { type: "string" },
        activities: { type: "array", items: { type: "string", enum: [...ACTIVITIES] } },
        metric: { type: "string", enum: [...METRICS] },
        target: { type: "number" },
        period: { type: "string", enum: [...PERIODS] },
        proof: { type: "string", enum: [...PROOFS] },
      },
      required: ["action"],
    },
  },
  done: {
    type: "array",
    items: { type: "number" },
    description: "The [id] of each habit he has just done or shown.",
  },
} as const;

export const COMMITMENTS_RULES = `3. Compromisos. Si fija, cambia o deja algo a lo que se compromete, va a commitments: action set (nuevo o cambiado, con id si ya existe) o stop (lo deja, con su id).
- De entreno ("4 veces al gimnasio a la semana", "40 km entre correr y bici"): activities entre gym, run y bike; metric sessions, km o minutes; proof auto.
- De dormir ("nunca más tarde de la una", "a la cama antes de las 23:30"): activities [sleep], metric bedtime, target la hora en minutos desde medianoche (01:00 = 60, 23:30 = 1410, 00:00 = 0), period day, proof auto. Lo mide el WHOOP; no se marca a mano.
- Una crema o un suplemento de cada día no es un hábito: va en su rutina de mañana, de noche o de antes de entrenar, con producto (rutina).
- Cualquier otro hábito ("tomar la pastilla todos los días", "leer 20 min cada día", "llamar a mi madre dos veces por semana"): activities vacío, metric sessions. proof photo si una foto o un vídeo lo puede enseñar (la pastilla, el libro, la comida, el agua); check solo si no hay nada que enseñar (llamar a su madre, no mirar el móvil).
- target; period week o day; title corto ("Gimnasio", "Pastilla", "Leer").
Un entreno hecho no es un compromiso: es un fact. Si dice o enseña que ha hecho uno de sus hábitos ("me he tomado la pastilla", una foto de la pastilla), pon su [id] en done. No confirmes nada de esto en reply: la confirmación con sus cifras se añade sola. Si pide verlos o el enlace, pon en reply el enlace a sus compromisos que tienes en sus datos, tal cual.`;

export type CommitmentChange =
  | {
      action: "set";
      id: number | null;
      title: string;
      activities: Activity[];
      metric: Metric;
      target: number;
      period: Period;
      proof: Proof;
    }
  | { action: "stop"; id: number | null; activities: Activity[] };

const TITLE: Record<Activity, string> = { gym: "Gimnasio", run: "Correr", bike: "Bici", sleep: "Dormir" };

const change = z.object({
  action: z.enum(["set", "stop"]),
  id: z.coerce.number().int().positive().optional().catch(undefined),
  title: z.string().trim().min(1).max(60).optional().catch(undefined),
  activities: z.array(z.enum(ACTIVITIES)).optional().catch(undefined),
  metric: z.enum(METRICS).optional().catch(undefined),
  target: z.coerce.number().min(0).max(10_000).optional().catch(undefined),
  period: z.enum(PERIODS).optional().catch(undefined),
  proof: z.enum(PROOFS).optional().catch(undefined),
});

/**
 * One bad entry drops that entry, never the message. A set needs a target and
 * either activities or a title: "a habit" with no name is nothing to track.
 */
export function parseCommitments(input: unknown): { changes: CommitmentChange[]; done: number[] } {
  const o = (input ?? {}) as { commitments?: unknown; done?: unknown };
  const changes = (Array.isArray(o.commitments) ? o.commitments : []).flatMap((item): CommitmentChange[] => {
    const c = change.safeParse(item);
    if (!c.success) return [];
    const activities = [...new Set(c.data.activities ?? [])].sort();
    const id = c.data.id ?? null;
    if (c.data.action === "stop") return id !== null || activities.length > 0 ? [{ action: "stop", id, activities }] : [];
    // A bedtime is its own kind: only WHOOP's nights, one a day, a clock time
    // (00:00 is 0, a real target). Sleep with any sport is a mistake: dropped.
    if (activities.includes("sleep") || c.data.metric === "bedtime") {
      const t = c.data.target;
      if (t === undefined || t >= 1440 || (activities.length > 0 && activities.join() !== "sleep")) return [];
      return [
        { action: "set", id, title: sinRayas(c.data.title ?? "Dormir"), activities: ["sleep"], metric: "bedtime", target: Math.round(t), period: "day", proof: "auto" },
      ];
    }
    if (!c.data.target || (activities.length === 0 && !c.data.title)) return [];
    const habit = activities.length === 0;
    return [
      {
        action: "set",
        id,
        title: sinRayas(c.data.title ?? activities.map((a) => TITLE[a]).join(" o ")),
        activities,
        metric: habit ? "sessions" : (c.data.metric ?? "sessions"),
        target: c.data.target,
        period: c.data.period ?? "week",
        // A habit has nothing to arrive on its own: "auto" would never count.
        proof: habit ? (c.data.proof === "photo" ? "photo" : "check") : (c.data.proof ?? "auto"),
      },
    ];
  });
  const done = (Array.isArray(o.done) ? o.done : []).flatMap((d) => {
    const n = Number(d);
    return Number.isInteger(n) && n > 0 ? [n] : [];
  });
  return { changes, done: [...new Set(done)] };
}

/** "Correr o bici" is the same commitment whichever order he says it in. */
export const sameActivities = (a: Activity[], b: Activity[]) =>
  a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
