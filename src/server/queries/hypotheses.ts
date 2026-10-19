import { isNull } from "drizzle-orm";

import { db } from "~/db";
import { hypotheses } from "~/db/schema";
import type { Candidate } from "~/server/insights/candidates";
import { specSchema, toCandidate } from "~/server/insights/hypotheses";

/** The AI's live hypotheses as candidates. One whose spec no longer parses is skipped, not thrown. */
export async function loadHypotheses(): Promise<Candidate[]> {
  const rows = await db.select({ id: hypotheses.id, spec: hypotheses.spec }).from(hypotheses).where(isNull(hypotheses.retiredAt));
  return rows.flatMap((r) => {
    const spec = specSchema.safeParse(r.spec);
    return spec.success ? [toCandidate(r.id, spec.data)] : [];
  });
}
