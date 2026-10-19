import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";

import { db } from "~/db";
import { chatMessages, reminders } from "~/db/schema";
import { addDays, dayTitle, localClock, localDay, TIME_ZONE } from "~/lib/day";
import { sendText, sendWhatsApp, whatsappConfigured } from "~/server/assistant/whatsapp";

/**
 * "Recuérdame a las 18:00 la pastilla". The agent writes the row; the tick
 * (every 10 minutes in production) sends what is due, so a reminder arrives
 * within ten minutes of its time.
 */

const wall = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Madrid's wall clock of an instant, as if it were UTC: the offset is the difference. */
function wallAsUtc(d: Date): number {
  const p = Object.fromEntries(wall.formatToParts(d).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
}

/**
 * `2026-10-16T18:00`, Madrid time, to the instant. Twice, because the offset
 * on the guess can differ from the offset on the answer across a DST change.
 */
export function fromLocal(text: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  let at = target;
  for (let i = 0; i < 2; i++) at = target - (wallAsUtc(new Date(at)) - at);
  return new Date(at);
}

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

/**
 * 🚨 Free text only reaches him inside the 24 h after his last WhatsApp
 * message; outside it Meta accepts the send and drops it later (131047). So
 * outside the window a reminder goes as the approved template.
 */
async function insideWindow(now: Date): Promise<boolean> {
  const [last] = await db
    .select({ at: chatMessages.createdAt })
    .from(chatMessages)
    .where(and(eq(chatMessages.direction, "in"), eq(chatMessages.channel, "whatsapp")))
    .orderBy(desc(chatMessages.createdAt))
    .limit(1);
  return Boolean(last && now.getTime() - last.at.getTime() < 23.5 * 3_600_000);
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
  for (const r of due) {
    const [claimed] = await db
      .update(reminders)
      .set({ sentAt: now })
      .where(and(eq(reminders.id, r.id), isNull(reminders.sentAt)))
      .returning({ id: reminders.id });
    if (!claimed) continue;
    const text = `Te recuerdo: ${r.body}`;
    const out = (await insideWindow(now)) ? await sendText(text) : await sendWhatsApp(text);
    if (out.ok) sent += 1;
    else console.error(`[reminders] ${r.id} no salió: ${out.detail}`);
  }
  return { sent };
}
