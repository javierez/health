import { eq } from "drizzle-orm";

import { db } from "~/db";
import { syncState } from "~/db/schema";

export async function readSyncState(source: string) {
  const [row] = await db.select().from(syncState).where(eq(syncState.source, source)).limit(1);
  return row ?? null;
}

export async function writeSyncState(
  source: string,
  patch: Partial<{ lastSweptAt: Date; cursorDate: string; lastError: string | null }>,
) {
  await db
    .insert(syncState)
    .values({ source, ...patch })
    .onConflictDoUpdate({ target: syncState.source, set: patch });
}
