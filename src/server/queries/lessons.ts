import { desc, eq, inArray } from "drizzle-orm";

import { db } from "~/db";
import { lessons } from "~/db/schema";

/** Enough to steer every message; a 21st pushes the oldest out of sight, not out of the table. */
const IN_FORCE = 20;

export async function saveLesson(body: string, chatMessageId: number | null): Promise<number | null> {
  const [row] = await db.insert(lessons).values({ body, chatMessageId }).returning({ id: lessons.id });
  return row?.id ?? null;
}

export async function forgetLessons(ids: number[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const gone = await db.update(lessons).set({ active: false }).where(inArray(lessons.id, ids)).returning({ body: lessons.body });
  return gone.map((g) => g.body);
}

/** The ones in force, oldest first, with the [id] to forget one. */
export async function lessonLines(): Promise<string[]> {
  const rows = await db.select().from(lessons).where(eq(lessons.active, true)).orderBy(desc(lessons.id)).limit(IN_FORCE);
  return rows.reverse().map((r) => `- [${r.id}] ${r.body}`);
}
