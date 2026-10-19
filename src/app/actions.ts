"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "~/db";
import { MEDICAL_KINDS, medical } from "~/db/schema";
import { toggleCheck } from "~/server/queries/commitments";
import { startExperiment, stopExperiment } from "~/server/queries/experiments";
import { toggleUse } from "~/server/queries/products";

const entry = z.object({
  kind: z.enum(MEDICAL_KINDS),
  title: z.string().trim().min(1).max(200),
  details: z.string().trim().max(4000).optional(),
  topic: z.string().trim().max(60).optional(),
  onDay: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export async function addMedical(form: FormData): Promise<{ success: boolean; error?: string }> {
  const parsed = entry.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { success: false, error: "Falta el título" };
  await db.insert(medical).values({
    kind: parsed.data.kind,
    title: parsed.data.title,
    details: parsed.data.details ? parsed.data.details : null,
    onDay: parsed.data.onDay ?? null,
    topic: parsed.data.topic ? parsed.data.topic : null,
  });
  revalidatePath("/");
  return { success: true };
}

/** Archived, never deleted: a past diagnosis still explains a later night. */
export async function archiveMedical(id: number) {
  await db.update(medical).set({ active: false }).where(eq(medical.id, id));
  revalidatePath("/");
}

const tick = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  key: z.string().regex(/^[a-z0-9-]{1,80}$/),
});

/** A row of «Hoy» or a day of a commitment, ticked or unticked. */
export async function toggleTick(input: { day: string; key: string }): Promise<
  { success: true; data: { checked: boolean } } | { success: false; error: string }
> {
  const parsed = tick.safeParse(input);
  if (!parsed.success) return { success: false, error: "No se pudo marcar" };
  const res = await toggleCheck(parsed.data);
  if ("error" in res) return { success: false, error: res.error };
  revalidatePath("/");
  return { success: true, data: res };
}

const experiment = z.object({ key: z.string().regex(/^[a-z0-9-]{1,80}$/), outcome: z.string().regex(/^[a-zA-Z]{1,20}$/) });

/** Two weeks of alternate days testing one finding (`queries/experiments.ts`). */
export async function tryFinding(input: { key: string; outcome: string }): Promise<
  { success: true; data: { id: number } } | { success: false; error: string }
> {
  const parsed = experiment.safeParse(input);
  if (!parsed.success) return { success: false, error: "No se pudo empezar" };
  const res = await startExperiment(parsed.data.key, parsed.data.outcome);
  if ("error" in res) return { success: false, error: res.error };
  revalidatePath("/");
  return { success: true, data: res };
}

export async function endExperiment(id: number): Promise<{ success: true; data: null } | { success: false; error: string }> {
  if (!Number.isInteger(id) || id < 1) return { success: false, error: "No se pudo parar" };
  await stopExperiment(id);
  revalidatePath("/");
  return { success: true, data: null };
}

/** «Lo he usado hoy» on a product; a second tap takes it back. */
export async function markUsed(id: number): Promise<{ success: true; data: { used: boolean } } | { success: false; error: string }> {
  if (!Number.isInteger(id) || id < 1) return { success: false, error: "No se pudo apuntar" };
  const res = await toggleUse(id);
  if (!res) return { success: false, error: "Ese producto ya no está" };
  revalidatePath("/");
  return { success: true, data: res };
}
