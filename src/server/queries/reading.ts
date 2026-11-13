import { and, desc, eq } from "drizzle-orm";

import { db } from "~/db";
import { assistantMessages, type Recommendation } from "~/db/schema";

/** The interpreter's last reading (`insights/interpret.ts`), or null before the first. */
export interface Reading {
  day: string;
  summary: string;
  items: Recommendation[];
}

export async function loadReading(): Promise<Reading | null> {
  const [row] = await db
    .select({ day: assistantMessages.day, body: assistantMessages.body, items: assistantMessages.items })
    .from(assistantMessages)
    .where(and(eq(assistantMessages.kind, "reading"), eq(assistantMessages.status, "saved")))
    .orderBy(desc(assistantMessages.day))
    .limit(1);
  return row ? { day: row.day, summary: row.body, items: row.items ?? [] } : null;
}
