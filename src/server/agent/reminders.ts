import { and, asc, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";

import { db } from "~/db";
import { chatMessages, reminders } from "~/db/schema";
import { addDays, dayTitle, fromLocal, localClock, localDay } from "~/lib/day";
import { reminderCap, type Planned } from "~/server/assistant/day-reminders";
import { sendNotice, whatsappConfigured } from "~/server/assistant/whatsapp";
import { hhmm } from "~/server/commitments/standing";
import { loadToday } from "~/server/queries/today";

/**
 * "Recuérdame a las 18:00 la pastilla". The agent writes the row; the tick
 * (every 10 minutes in production) sends what is due, so a reminder arrives
 * within ten minutes of its time. The morning note writes rows too, the day's
 * reminders (`~/server/assistant/day-reminders`), each with its list row in
 * `itemKey`.
 */

/** "hoy a las 18:00", "mañana a las 08:00", "vie, 17 oct a las 09:30". */
export function whenText(at: Date, now: Date): string {
  const day = localDay(at);
  const today = localDay(now);
  const name = day === today ? "hoy" : day === addDays(today, 1) ? "mañana" : dayTitle(day, today);
  return `${name} a las ${localClock(at)}`;
}

export async function addReminder(input: { at: Date; body: string; chatMessageId: number | null }) {
  const [row] = await db.insert(reminders).values(input).returning({ id: reminders.id });
  return row?.id ?? null;
}

export async function addDayReminders(day: string, planned: Planned[]) {
  const rows = planned.flatMap((p) => {
    const at = fromLocal(`${day}T${hhmm(p.minutes)}`);
    return at ? [{ at, body: p.body, planned: true, itemKey: p.key }] : [];
  });
  if (rows.length > 0) await db.insert(reminders).values(rows);
}

/** How many of the day's planned reminders already went out. */
export async function dayRemindersSent(day: string): Promise<number> {
  const rows = await db
    .select({ id: reminders.id })
    .from(reminders)
    .where(and(eq(reminders.planned, true), isNotNull(reminders.sentAt), gte(reminders.at, fromLocal(`${day}T00:00`)!)));
  return rows.length;
}

/** The day's list written again: its reminders still to come give way to the new ones. */
export async function replaceDayReminders(day: string, now: Date, planned: Planned[]) {
  await db
    .update(reminders)
    .set({ cancelled: true })
    .where(and(eq(reminders.planned, true), isNull(reminders.sentAt), eq(reminders.cancelled, false), gte(reminders.at, now)));
  await addDayReminders(day, planned);
}

/** How many today, from how he answered the last week's (`reminderCap`): in the chat or the panel. */
export async function dayReminderCap(now: Date): Promise<number> {
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const [sent, inbound] = await Promise.all([
    db
      .select({ at: reminders.sentAt })
      .from(reminders)
      .where(and(eq(reminders.planned, true), gte(reminders.sentAt, since))),
    db
      .select({ at: chatMessages.createdAt })
      .from(chatMessages)
      .where(and(eq(chatMessages.direction, "in"), gte(chatMessages.createdAt, since))),
  ]);
  return reminderCap(
    sent.flatMap((s) => (s.at ? [s.at] : [])),
    inbound.map((i) => i.at),
  );
}

export async function cancelReminders(ids: number[]): Promise<string[]> {
  const out: string[] = [];
  for (const id of ids) {
    const [r] = await db
      .update(reminders)
      .set({ cancelled: true })
      .where(and(eq(reminders.id, id), isNull(reminders.sentAt)))
      .returning({ body: reminders.body });
    if (r) out.push(r.body);
  }
  return out;
}

export async function pendingReminders() {
  return db
    .select()
    .from(reminders)
    .where(and(isNull(reminders.sentAt), eq(reminders.cancelled, false)))
    .orderBy(asc(reminders.at));
}

/** Claimed one by one before sending: two ticks at the same minute send it once. */
export async function sendDueReminders(now = new Date()): Promise<{ sent: number }> {
  if (!whatsappConfigured()) return { sent: 0 };
  const due = await db
    .select()
    .from(reminders)
    .where(and(isNull(reminders.sentAt), eq(reminders.cancelled, false), lte(reminders.at, now), gte(reminders.at, new Date(now.getTime() - 86_400_000))))
    .orderBy(asc(reminders.at));
  let sent = 0;
  let done: Set<string> | null = null;
  for (const r of due) {
    // One of the day's: not an hour late (after a dead tick, they would all
    // arrive at once), and not once its row is done.
    if (r.planned) {
      if (r.itemKey) done ??= new Set((await loadToday(now)).rows.flatMap((row) => (row.done ? [row.key] : [])));
      if (now.getTime() - r.at.getTime() > 3_600_000 || (r.itemKey && done?.has(r.itemKey))) {
        await db.update(reminders).set({ cancelled: true }).where(and(eq(reminders.id, r.id), isNull(reminders.sentAt)));
        continue;
      }
    }
    const [claimed] = await db
      .update(reminders)
      .set({ sentAt: now })
      .where(and(eq(reminders.id, r.id), isNull(reminders.sentAt)))
      .returning({ id: reminders.id });
    if (!claimed) continue;
    const text = r.planned ? r.body : `Te recuerdo: ${r.body}`;
    const out = await sendNotice(text, now);
    if (out.ok) sent += 1;
    else console.error(`[reminders] ${r.id} no salió: ${out.detail}`);
  }
  return { sent };
}
