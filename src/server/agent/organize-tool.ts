import type Anthropic from "@anthropic-ai/sdk";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "~/db";
import { facts } from "~/db/schema";
import { tidy } from "~/lib/trackers";
import { ensureKind } from "~/server/kinds";
import type { TurnState } from "./tools";

/**
 * «Pon la sauna en Descanso», «junta migraña con dolor de cabeza», «cambia
 * Descanso por Recuperación»: his categories are his, and he rearranges them by
 * talking. Every past note moves with them; nothing is deleted.
 */
export const ORGANIZE_TOOL: Anthropic.Tool = {
  name: "organizar",
  description: "Cambia de categoría lo que apunta, o renombra (y así junta) tipos y categorías. Con los nombres exactos de «Lo que apunta».",
  input_schema: {
    type: "object",
    properties: {
      mover: {
        type: "array",
        description: "Un tipo a otra categoría, nueva o de las suyas.",
        items: { type: "object", properties: { tipo: { type: "string" }, categoria: { type: "string" } }, required: ["tipo", "categoria"] },
      },
      renombrar_tipo: {
        type: "array",
        description: "Otro nombre para un tipo; si ya existe, los dos quedan en uno.",
        items: { type: "object", properties: { de: { type: "string" }, a: { type: "string" } }, required: ["de", "a"] },
      },
      renombrar_categoria: {
        type: "array",
        description: "Otro nombre para una categoría; si ya existe, quedan en una.",
        items: { type: "object", properties: { de: { type: "string" }, a: { type: "string" } }, required: ["de", "a"] },
      },
    },
  },
};

const name = z.string().trim().min(1).max(40);
const input = z.object({
  mover: z.array(z.object({ tipo: name, categoria: name })).optional().catch(undefined),
  renombrar_tipo: z.array(z.object({ de: name, a: name })).optional().catch(undefined),
  renombrar_categoria: z.array(z.object({ de: name, a: name })).optional().catch(undefined),
});

const OWN = inArray(facts.kind, ["other", "training"]);
const named = (n: string) => sql`lower(${facts.data}->>'name') = lower(${n})`;
const filed = (c: string) => sql`lower(${facts.data}->>'category') = lower(${c})`;
const patch = (o: Record<string, string>) => sql`${facts.data} || ${JSON.stringify(o)}::jsonb`;
const times = (n: number) => (n === 1 ? "1 apunte" : `${n} apuntes`);

export async function runOrganize(raw: unknown, s: TurnState): Promise<string> {
  const v = input.safeParse(raw ?? {});
  if (!v.success) return "No entendí qué mover o renombrar.";
  const done: string[] = [];

  for (const m of v.data.mover ?? []) {
    const category = tidy(m.categoria);
    const rows = await db
      .update(facts)
      .set({ data: patch({ category }) })
      .where(and(eq(facts.kind, "other"), named(m.tipo)))
      .returning({ id: facts.id });
    done.push(rows.length > 0 ? `${m.tipo} → ${category} (${times(rows.length)})` : `No hay nada apuntado como «${m.tipo}»`);
  }

  for (const r of v.data.renombrar_tipo ?? []) {
    const to = tidy(r.a);
    // Joined into one he already has: it takes that one's category.
    const [into] = await db
      .select({ category: sql<string | null>`${facts.data}->>'category'` })
      .from(facts)
      .where(and(eq(facts.kind, "other"), named(to)))
      .limit(1);
    const kind = await ensureKind(to);
    const rows = await db
      .update(facts)
      .set({ data: patch({ name: to, kind, ...(into?.category ? { category: into.category } : {}) }) })
      .where(and(OWN, named(r.de)))
      .returning({ id: facts.id });
    done.push(rows.length > 0 ? `${r.de} ahora es ${to} (${times(rows.length)})` : `No hay nada apuntado como «${r.de}»`);
  }

  for (const r of v.data.renombrar_categoria ?? []) {
    const to = tidy(r.a);
    const rows = await db
      .update(facts)
      .set({ data: patch({ category: to }) })
      .where(and(eq(facts.kind, "other"), filed(r.de)))
      .returning({ id: facts.id });
    done.push(rows.length > 0 ? `Categoría ${r.de} → ${to} (${times(rows.length)})` : `No hay ninguna categoría «${r.de}»`);
  }

  s.actions.push(...done.filter((d) => !d.startsWith("No hay")));
  return done.join("\n") || "Nada que cambiar.";
}
