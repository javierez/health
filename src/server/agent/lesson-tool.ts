import type Anthropic from "@anthropic-ai/sdk";

import { sinRayas } from "~/lib/sin-rayas";
import { forgetLessons, lessonLines, saveLesson } from "~/server/queries/lessons";
import type { TurnState } from "./tools";

/**
 * «Eso no es así», «no me cuentes rachas»: what he corrects in how the
 * assistant talks or reads his data is kept, and every message after it reads
 * it (`lessonLines` in the context). Instinct's habit (26-oct-2026, «more
 * intelligent, like Instinct»): it picks up when he didn't like how something
 * was said, instead of waiting for someone to change the prompt.
 */
export const LESSON_TOOL: Anthropic.Tool = {
  name: "aprender",
  description:
    "Guarda para siempre lo que te corrige de cómo le hablas o le cuentas sus datos, o cómo quiere las cosas. O olvida una con su [id]. No es un dato suyo (eso es apuntar) ni un recordatorio.",
  input_schema: {
    type: "object",
    properties: {
      guardar: {
        type: "string",
        description: "Una frase para ti, con su porqué: «Una noche corta, con la hora de la banda: empieza a contar tarde y él lo ve».",
      },
      olvidar: { type: "array", items: { type: "number" } },
    },
  },
};

export function parseLesson(input: unknown): { save: string | null; forget: number[] } {
  const o = (input ?? {}) as { guardar?: unknown; olvidar?: unknown };
  const save = typeof o.guardar === "string" ? sinRayas(o.guardar.replace(/\s+/g, " ").trim()).slice(0, 300) : "";
  const forget = Array.isArray(o.olvidar) ? o.olvidar.filter((n): n is number => Number.isInteger(n) && n > 0) : [];
  return { save: save || null, forget: [...new Set(forget)] };
}

export async function runLesson(input: unknown, s: TurnState): Promise<string> {
  const asked = parseLesson(input);
  const out = (await forgetLessons(asked.forget)).map((b) => `Olvidado: ${b}`);
  if (asked.save) {
    const id = await saveLesson(asked.save, s.chatMessageId);
    out.push(`Aprendido [${id}]: ${asked.save}`);
  }
  s.actions.push(...out);
  if (out.length === 0) return "Nada que guardar ni olvidar.";
  return [...out, "Las que siguen en pie:", ...(await lessonLines())].join("\n");
}
