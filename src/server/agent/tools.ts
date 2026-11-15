import type Anthropic from "@anthropic-ai/sdk";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "~/db";
import {
  FACT_KINDS,
  MEDICAL_KINDS,
  facts,
  medical,
  type FactData,
  type MedicalKind,
} from "~/db/schema";
import { fromLocal, localDay } from "~/lib/day";
import { sinRayas } from "~/lib/sin-rayas";
import { DEFAULT_MODEL } from "~/server/classify/episodes";
import { FACT_FIELDS, parseFacts, placeFact, TOLD_FIELDS, withFoods } from "~/server/classify/facts";
import { COMMITMENTS_FIELDS, parseCommitments, type CommitmentChange } from "~/server/commitments/from-chat";
import { ensureKind } from "~/server/kinds";
import { checkedToday, toggleCheck } from "~/server/queries/commitments";
import { loadToilet } from "~/server/queries/toilet";
import { learnMovesLater } from "~/server/training/learn";
import { LESSON_TOOL, runLesson } from "./lesson-tool";
import { ORGANIZE_TOOL, runOrganize } from "./organize-tool";
import { PRODUCT_TOOL, runProduct } from "./product-tool";
import { AGENT_VERSION } from "./prompt";
import { ROUTINE_TOOL, runRoutine } from "./routine-tool";
import { addReminder, cancelReminders, whenText } from "./reminders";
import { range, search, SEARCH_KINDS } from "./search";

/**
 * Everything he can ask for, as tools. One message can call several; the turn
 * keeps what they did in `TurnState`, so the commitments are applied once at
 * the end and the panel can show a ✓ line per action.
 */
export interface TurnState {
  now: Date;
  /** When he sent it: a meal "a las 14:00" is placed from here. */
  at: Date;
  chatMessageId: number;
  /** The message's id when it carried a photo or a video (a photo-proof habit needs it). */
  photo: number | null;
  /** The photo itself, when it was one: a product's icon copies its shape. */
  image: { data: Buffer; mime: string } | null;
  changes: CommitmentChange[];
  done: number[];
  trained: boolean;
  drank: boolean;
  sync: boolean;
  /** "Press banca 1×8 a 80 kg", one per thing done: the panel shows them under the reply. */
  actions: string[];
  /** Today's list, key to title, so a tick says which row. */
  titles: Record<string, string>;
}

const ids = { type: "array", items: { type: "number" } } as const;

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "apuntar",
    description: "Apunta comidas, entrenos, peso, cosas médicas, cada vez que va al baño y cualquier otra cosa suya de su mensaje.",
    input_schema: {
      type: "object",
      properties: {
        facts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: [...FACT_KINDS] },
              ...FACT_FIELDS,
              ...TOLD_FIELDS,
              like: { type: "number", description: "«Lo de siempre», «lo mismo que ayer»: el [id] de la comida a copiar. Sin foods, se copia tal cual." },
              rutina: { type: "number", description: "En un entreno que es toda o parte de una de sus rutinas de entreno: su [id]. Con solo los ejercicios que hizo." },
            },
            required: ["kind", "summary", "evidence", "confidence"],
          },
        },
      },
      required: ["facts"],
    },
  },
  {
    name: "ficha",
    description: "Añade a su ficha médica o archiva lo que ya no vale.",
    input_schema: {
      type: "object",
      properties: {
        anadir: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: [...MEDICAL_KINDS] },
              title: { type: "string" },
              details: { type: "string" },
              on_day: { type: "string", description: "YYYY-MM-DD" },
              tema: { type: "string", description: "De qué va, corto: Cuello, Orina, Antecedentes." },
            },
            required: ["kind", "title"],
          },
        },
        archivar: { ...ids, description: "Los [id] de la ficha que ya no valen." },
      },
    },
  },
  {
    name: "compromisos",
    description: "Crea, cambia o quita sus compromisos, y marca los hábitos que acaba de cumplir.",
    input_schema: { type: "object", properties: { ...COMMITMENTS_FIELDS } },
  },
  {
    name: "recordar",
    description: "Le escribe por WhatsApp a la hora que diga. También cancela recordatorios.",
    input_schema: {
      type: "object",
      properties: {
        crear: {
          type: "array",
          items: {
            type: "object",
            properties: {
              cuando: { type: "string", description: "Hora de Madrid, YYYY-MM-DDTHH:MM" },
              texto: { type: "string", description: "Lo que hay que recordarle, corto: «tomar la pastilla»." },
            },
            required: ["cuando", "texto"],
          },
        },
        cancelar: { ...ids, description: "Los [id] de recordatorios a cancelar." },
      },
    },
  },
  {
    name: "marcar",
    description: "Tacha una fila de su lista de hoy, o la destacha con hecho: false.",
    input_schema: {
      type: "object",
      properties: {
        clave: { type: "string", description: "La [clave] de la fila." },
        hecho: { type: "boolean", description: "false para destacharla." },
        dia: { type: "string", description: "YYYY-MM-DD; hoy si no se dice." },
      },
      required: ["clave"],
    },
  },
  {
    name: "buscar",
    description: "Busca en todo lo suyo: apuntes, sueño, entrenos, ficha, grabaciones, chat, código y su WhatsApp.",
    input_schema: {
      type: "object",
      properties: {
        que: { type: "string", enum: [...SEARCH_KINDS] },
        desde: { type: "string", description: "YYYY-MM-DD" },
        hasta: { type: "string", description: "YYYY-MM-DD" },
        texto: { type: "string" },
      },
      required: ["que"],
    },
  },
  PRODUCT_TOOL,
  ORGANIZE_TOOL,
  ROUTINE_TOOL,
  LESSON_TOOL,
  {
    name: "borrar_apuntes",
    description: "Borra apuntes que estaban mal o no eran suyos.",
    input_schema: { type: "object", properties: { ids: { ...ids, description: "Los [id] de buscar." } }, required: ["ids"] },
  },
  {
    name: "sincronizar",
    description: "Trae ya lo último de WHOOP, Pocket y GitHub. Tarda unos minutos.",
    input_schema: { type: "object", properties: {} },
    // The tools and the rules are the fixed part of every call: cached here.
    cache_control: { type: "ephemeral" },
  },
];

const fileEntry = z.object({
  kind: z.enum(MEDICAL_KINDS),
  title: z.string().trim().min(1),
  details: z.string().optional().catch(undefined),
  on_day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  tema: z.string().optional().catch(undefined),
});

/** One bad entry drops that entry, not the rest. */
export function parseFile(
  input: unknown,
): { kind: MedicalKind; title: string; details: string | null; onDay: string | null; topic: string | null }[] {
  const list = (input as { anadir?: unknown } | null)?.anadir;
  return (Array.isArray(list) ? list : []).flatMap((item) => {
    const e = fileEntry.safeParse(item);
    if (!e.success) return [];
    const details = e.data.details?.trim();
    const topic = e.data.tema?.trim();
    return [
      {
        kind: e.data.kind,
        title: sinRayas(e.data.title),
        details: details ? sinRayas(details) : null,
        onDay: e.data.on_day ?? null,
        topic: topic ? sinRayas(topic) : null,
      },
    ];
  });
}

/** Whole positive numbers only: an id the model made up as "3a" is no id. */
export function idList(v: unknown): number[] {
  return [...new Set((Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}

export interface Reminder {
  at: Date;
  body: string;
}

/** A reminder in the past or with no readable time is refused, with the reason for the model. */
export function parseReminders(input: unknown, now: Date): { ok: Reminder[]; refused: string[] } {
  const list = (input as { crear?: unknown } | null)?.crear;
  const ok: Reminder[] = [];
  const refused: string[] = [];
  for (const item of Array.isArray(list) ? list : []) {
    const o = (item ?? {}) as { cuando?: unknown; texto?: unknown };
    const body = typeof o.texto === "string" ? sinRayas(o.texto.trim()) : "";
    const at = typeof o.cuando === "string" ? fromLocal(o.cuando) : null;
    if (!body || !at) refused.push(`«${String(o.cuando)}» no es una hora YYYY-MM-DDTHH:MM`);
    else if (at.getTime() < now.getTime() - 60_000) refused.push(`${String(o.cuando)} ya ha pasado`);
    else ok.push({ at, body });
  }
  return { ok, refused };
}

/** «Lo de siempre»: a meal with `like` and no foods of its own takes the foods of the meal it names. */
async function copyMeals(found: ReturnType<typeof parseFacts>): Promise<void> {
  const likes = found.flatMap((f) => (f.like && !f.data.foods ? [f.like] : []));
  if (likes.length === 0) return;
  const rows = await db
    .select({ id: facts.id, data: facts.data })
    .from(facts)
    .where(and(inArray(facts.id, likes), eq(facts.kind, "meal")));
  const foodsOf = new Map(rows.map((r) => [r.id, (r.data as FactData).foods]));
  for (const f of found) {
    const foods = f.like ? foodsOf.get(f.like) : undefined;
    if (foods?.length && !f.data.foods) f.data = withFoods({ ...f.data, items: undefined }, foods);
  }
}

type Run = (input: unknown, s: TurnState) => Promise<string>;

const RUN: Record<string, Run> = {
  apuntar: async (input, s) => {
    const found = parseFacts(input);
    await copyMeals(found);
    if (found.length === 0) return "Nada apuntado: faltaba el resumen o era una suposición (confidence baja).";
    // Something new gets its kind, and its icon is drawn after the reply.
    const kindOf = await Promise.all(found.map((f) => (f.tipo ? ensureKind(f.tipo) : null)));
    const rows = await db
      .insert(facts)
      .values(
        found.map((f, i) => {
          const when = placeFact(s.at, { atSeconds: 0, clock: f.clock });
          const kind = kindOf[i];
          return {
            chatMessageId: s.chatMessageId,
            kind: f.kind,
            at: when,
            day: localDay(when),
            summary: f.summary,
            data: kind ? { ...f.data, kind } : f.data,
            evidence: f.evidence,
            confidence: f.confidence,
            model: DEFAULT_MODEL,
            promptVersion: AGENT_VERSION,
          };
        }),
      )
      .returning({ id: facts.id, summary: facts.summary, kind: facts.kind });
    learnMovesLater(found);
    s.actions.push(...rows.map((r) => r.summary));
    const lines = rows.map((r) => `[${r.id}] ${r.summary}`);
    if (rows.some((r) => r.kind === "training")) {
      s.trained = true;
      // The code writes where his commitments stand after a training, in its own message.
      lines.push("Cuánto lleva de sus compromisos de entreno se le manda solo, en un mensaje aparte al final: no lo repitas.");
    }
    if (found.some((f) => f.data.waterMl)) {
      s.drank = true;
      lines.push("Cuánta agua lleva hoy se le manda sola, en un mensaje aparte al final: no lo repitas.");
    }
    if (rows.some((r) => r.kind === "toilet")) lines.push(`Hoy en el baño: ${(await loadToilet(s.now)).todayLine}`);
    return lines.join("\n");
  },

  ficha: async (input, s) => {
    const added = parseFile(input);
    if (added.length > 0) await db.insert(medical).values(added);
    const gone = idList((input as { archivar?: unknown } | null)?.archivar);
    const archived =
      gone.length > 0
        ? await db.update(medical).set({ active: false }).where(inArray(medical.id, gone)).returning({ title: medical.title })
        : [];
    s.actions.push(...added.map((a) => `En la ficha: ${a.title}`), ...archived.map((a) => `Archivado: ${a.title}`));
    if (added.length === 0 && archived.length === 0) return "Nada cambiado en la ficha.";
    return [...added.map((a) => `Añadido: ${a.title}`), ...archived.map((a) => `Archivado: ${a.title}`)].join("\n");
  },

  compromisos: async (input, s) => {
    const { changes, done } = parseCommitments(input);
    s.changes.push(...changes);
    s.done.push(...done);
    if (changes.length === 0 && done.length === 0) return "Nada válido: a un compromiso le falta el objetivo o el nombre.";
    return "Hecho. La confirmación con sus cifras se le añade sola al final de tu respuesta: no la repitas.";
  },

  recordar: async (input, s) => {
    const { ok, refused } = parseReminders(input, s.now);
    const lines = [...refused.map((r) => `No creado: ${r}`)];
    for (const r of ok) {
      const id = await addReminder({ at: r.at, body: r.body, chatMessageId: s.chatMessageId });
      const when = whenText(r.at, s.now);
      s.actions.push(`Recordatorio: ${r.body}, ${when}`);
      lines.push(`[${id}] ${r.body}, ${when}`);
    }
    const cancelled = await cancelReminders(idList((input as { cancelar?: unknown } | null)?.cancelar));
    s.actions.push(...cancelled.map((b) => `Cancelado: ${b}`));
    lines.push(...cancelled.map((b) => `Cancelado: ${b}`));
    return lines.length > 0 ? lines.join("\n") : "Nada que crear ni cancelar.";
  },

  marcar: async (input, s) => {
    const o = (input ?? {}) as { clave?: unknown; dia?: unknown; hecho?: unknown };
    const key = typeof o.clave === "string" ? o.clave.trim() : "";
    const day = typeof o.dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.dia) ? o.dia : localDay(s.now);
    if (!/^[a-z0-9-]{1,80}$/.test(key)) return `«${key}» no es una clave de su lista.`;
    // The panel's tick toggles; here it is set, so a second «ya lo he hecho» never unticks it.
    const done = o.hecho !== false;
    if ((await checkedToday(day)).has(key) === done) return done ? "Ya estaba tachada." : "Ya estaba sin tachar.";
    const res = await toggleCheck({ day, key });
    if ("error" in res) return res.error;
    const title = s.titles[key] ?? "una fila de la lista";
    s.actions.push(done ? `Tachado: ${title}` : `Sin tachar: ${title}`);
    return done ? "Tachada." : "Destachada.";
  },

  buscar: async (input, s) => {
    const o = (input ?? {}) as { que?: unknown; texto?: unknown };
    const kind = SEARCH_KINDS.find((k) => k === o.que);
    if (!kind) return `que tiene que ser uno de: ${SEARCH_KINDS.join(", ")}.`;
    const text = typeof o.texto === "string" && o.texto.trim().length > 0 ? o.texto.trim() : null;
    return search(kind, { ...range(input as Record<string, unknown>, localDay(s.now)), text });
  },

  producto: runProduct,
  organizar: runOrganize,
  rutina_entreno: runRoutine,
  aprender: runLesson,

  borrar_apuntes: async (input, s) => {
    const list = idList((input as { ids?: unknown } | null)?.ids);
    if (list.length === 0) return "Sin ids: búscalos con buscar (que: apuntes).";
    const gone = await db.delete(facts).where(inArray(facts.id, list)).returning({ summary: facts.summary });
    s.actions.push(...gone.map((g) => `Borrado: ${g.summary}`));
    return gone.length > 0 ? gone.map((g) => `Borrado: ${g.summary}`).join("\n") : "Ninguno de esos ids existe.";
  },

  sincronizar: async (_input, s) => {
    s.sync = true;
    s.actions.push("Trayendo lo último de WHOOP, Pocket y GitHub");
    return "En marcha. Llega en unos minutos.";
  },
};

export async function runTool(name: string, input: unknown, s: TurnState): Promise<{ content: string; isError: boolean }> {
  const run = RUN[name];
  if (!run) return { content: `No existe la herramienta ${name}.`, isError: true };
  try {
    return { content: await run(input, s), isError: false };
  } catch (err) {
    console.error(`[agent] ${name}`, err);
    return { content: `Ha fallado: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}
