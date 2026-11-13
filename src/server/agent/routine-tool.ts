import type Anthropic from "@anthropic-ai/sdk";

import { later } from "~/server/kinds";
import { ensureMove } from "~/server/training/learn";
import { parseRoutines, saveRoutines } from "~/server/training/routines";
import type { TurnState } from "./tools";

/**
 * «Esta es mi rutina de pierna», a video of one, «quita el puente de la
 * rutina»: his training routines, saved with their exercises in order. A
 * training that does all or part of one is still written with `apuntar`.
 */
export const ROUTINE_TOOL: Anthropic.Tool = {
  name: "rutina_entreno",
  description: "Guarda o cambia una rutina de entreno suya (sus ejercicios en orden, con series, reps o segundos), o archiva la que ya no hace. No es la rutina de cremas.",
  input_schema: {
    type: "object",
    properties: {
      guardar: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "number", description: "Para cambiar una de las suyas: se reescribe entera." },
            nombre: { type: "string", description: "«Rutina de pierna», el que él le dé." },
            ejercicios: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  nombre: { type: "string" },
                  series: { type: "number" },
                  reps: { type: "number" },
                  segundos: { type: "number", description: "Si se aguanta quieto, en vez de reps." },
                  peso_kg: { type: "number" },
                  nota: { type: "string", description: "Corta: «por pierna», «con banda»." },
                },
                required: ["nombre"],
              },
            },
          },
          required: ["nombre", "ejercicios"],
        },
      },
      archivar: { type: "array", items: { type: "number" } },
    },
  },
};

export async function runRoutine(input: unknown, s: TurnState): Promise<string> {
  const asked = parseRoutines(input);
  if (asked.save.length === 0 && asked.archive.length === 0) return "Nada válido: una rutina necesita nombre y al menos un ejercicio.";
  const lines = await saveRoutines(asked);
  // Each exercise learned once: what it works and its drawing.
  const names = asked.save.flatMap((r) => r.exercises.map((e) => e.name));
  if (names.length > 0) later(async () => {
    for (const name of names) await ensureMove(name, false);
  });
  s.actions.push(...lines.map((l) => l.replace(/^\[\d+\] /, "Rutina: ")));
  return lines.join("\n");
}
