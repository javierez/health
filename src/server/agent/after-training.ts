import { and, eq, gte } from "drizzle-orm";

import { db } from "~/db";
import { facts, reminders, whoopRecords } from "~/db/schema";
import { fromLocal, localDay } from "~/lib/day";
import { ROUTINE_TITLE } from "~/lib/routines";
import { whoopActivity, type Standing } from "~/server/commitments/standing";
import { loadCommitments } from "~/server/queries/commitments";

/**
 * «Antes de entrenar» has no hour: he trains when he can (Javier,
 * 22-oct-2026: «sería imposible de determinar. Solo que te pregunte después
 * de entrenar si lo has hecho»). Half an hour after the last sign of training
 * today (a WHOOP workout that ended, an exercise told to the chat), one
 * question; his «sí» is the agent's `marcar`. Once a day, and not once ticked.
 */
export const QUIET_MINUTES = 30;

/** The question, or null: not owed today, already ticked, still training, or asked. */
export function afterTraining(p: { routine: Standing | undefined; last: Date | null; asked: boolean; now: Date }): string | null {
  const r = p.routine;
  if (!r || r.status !== "pending" || r.doneToday || p.asked || !p.last) return null;
  if (p.now.getTime() - p.last.getTime() < QUIET_MINUTES * 60_000) return null;
  const names = (r.members ?? []).map((m) => m.name);
  const what = names.length > 1 ? `${names.slice(0, -1).join(", ")} y ${names.at(-1)}` : names[0];
  return `¿Te tomaste lo de antes de entrenar${what ? ` (${what})` : ""}?`;
}

/** Leaves the question as one of the day's reminders: the reminders tick sends it, and drops it if the row got ticked. */
export async function askAfterTraining(now = new Date()): Promise<boolean> {
  const today = localDay(now);
  const since = fromLocal(`${today}T00:00`) ?? now;
  const routine = (await loadCommitments(now)).find((c) => c.commitment.title === ROUTINE_TITLE.entreno);
  if (!routine || routine.status !== "pending") return false;
  const key = `commitment-${routine.commitment.id}`;
  const [workouts, told, asked] = await Promise.all([
    db
      .select({ end: whoopRecords.endAt, label: whoopRecords.label })
      .from(whoopRecords)
      .where(and(eq(whoopRecords.kind, "workout"), eq(whoopRecords.day, today))),
    db
      .select({ at: facts.createdAt })
      .from(facts)
      .where(and(eq(facts.kind, "training"), eq(facts.day, today))),
    db
      .select({ id: reminders.id })
      .from(reminders)
      .where(and(eq(reminders.itemKey, key), gte(reminders.at, since)))
      .limit(1),
  ]);
  const times = [
    ...workouts.flatMap((w) => (w.end && whoopActivity(w.label) ? [w.end.getTime()] : [])),
    ...told.map((t) => t.at.getTime()),
  ];
  const body = afterTraining({ routine, last: times.length > 0 ? new Date(Math.max(...times)) : null, asked: asked.length > 0, now });
  if (!body) return false;
  await db.insert(reminders).values({ at: now, body, planned: true, itemKey: key });
  return true;
}
