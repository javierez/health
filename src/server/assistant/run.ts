import { and, desc, eq, gte, isNull } from "drizzle-orm";

import { db } from "~/db";
import { assistantMessages, facts, type FactData } from "~/db/schema";
import { hm, localDay, localMinutes } from "~/lib/day";
import { isMood } from "~/lib/trackers";
import { addDayReminders, dayReminderCap, dayRemindersSent, replaceDayReminders } from "~/server/agent/reminders";
import { nudgeDue } from "~/server/commitments/standing";
import { evolutionReady } from "~/server/evolution/client";
import { catchUpMessages } from "~/server/evolution/sync";
import { loadCommitments } from "~/server/queries/commitments";
import { buildContext, loadNights } from "./context";
import { pickReminders } from "./day-reminders";
import { withMoodAsk } from "./mood-ask";
import { bedtimePlan, dueMessages, nightOver, type BedtimePlan, type Night } from "./plan";
import { sendNotice, whatsappConfigured } from "./whatsapp";
import { writeMessage } from "./write";

/**
 * One assistant pass. Runs on every tick; almost always decides there is
 * nothing to say.
 *
 * 🚨 The row is claimed BEFORE the model is called: `(kind, day)` is unique,
 * so when the tick, a webhook and an open board run at the same minute, one
 * wins the insert and the others see the row and leave. Without it the
 * bedtime alert arrived twice.
 */
export async function runAssistant(now = new Date()): Promise<{ plan: BedtimePlan; sent: string[] }> {
  const [nights, commitments] = await Promise.all([loadNights(), loadCommitments(now)]);
  const cap = commitments.find((c) => c.commitment.metric === "bedtime");
  const plan = bedtimePlan(nights, cap?.commitment.target ?? null, now);

  const recent = await db
    .select({ kind: assistantMessages.kind, day: assistantMessages.day })
    .from(assistantMessages)
    .where(gte(assistantMessages.createdAt, new Date(now.getTime() - 2 * 86_400_000)));
  const sent = new Set(recent.map((m) => `${m.kind}:${m.day}`));

  const due = dueMessages(now, { plan, lastWake: nights[0]?.end ?? null, seen: nights[0]?.seen ?? null, sent });
  const nudge = nudgeDue(now, commitments, sent);
  if (nudge) due.push(nudge);
  const done: string[] = [];

  for (const d of due) {
    const [claimed] = await db
      .insert(assistantMessages)
      .values({ kind: d.kind, day: d.day, body: "", status: "writing" })
      .onConflictDoNothing()
      .returning({ id: assistantMessages.id });
    if (!claimed) continue;

    const cap = d.kind === "morning" ? await dayReminderCap(now) : 0;
    // WhatsApp syncs after midnight: without this, the morning never has his first message of the day.
    if (d.kind === "morning" && evolutionReady()) await catchUpMessages().catch((e) => console.error("[assistant] whatsapp", e));
    const written = await writeMessage(d.kind, plan, await buildContext(now), cap);
    if (!written.ok) {
      await db
        .update(assistantMessages)
        .set({ status: "failed", error: written.detail })
        .where(eq(assistantMessages.id, claimed.id));
      continue;
    }

    const text = withMoodAsk(written.text, d.kind, await lastMood(now), now);
    const out = whatsappConfigured() ? await sendNotice(text, now) : null;
    await db
      .update(assistantMessages)
      .set({
        body: text,
        items: written.items,
        nightMinutes: d.kind === "morning" ? sleptInto(nights, d.day) : null,
        status: out === null ? "not-configured" : out.ok ? "sent" : "failed",
        error: out && !out.ok ? out.detail : null,
        waMessageId: out?.ok ? out.id : null,
      })
      .where(eq(assistantMessages.id, claimed.id));
    const titles = written.items.map((i) => i.title);
    if (cap > 0) await addDayReminders(d.day, pickReminders(written.avisos, titles, localMinutes(now), plan.bedMinutes, cap));
    done.push(`${d.kind}:${d.day}`);
  }
  if (await refreshMorning(now, plan, nights)) done.push(`morning-refresh:${localDay(now)}`);

  return { plan, sent: done };
}

/** What he slept in the night that ended that morning, if it has. */
const sleptInto = (nights: Night[], day: string) => (nights[0] && localDay(nights[0].end) === day ? (nights[0].asleepMinutes ?? null) : null);

/** An hour or more off what the note said, and the day's list is written again. */
const OFF_BY = 60;

/**
 * The morning note went out on a night that was not over (the 10:00 one with
 * the band still sending it, a Sunday he slept in): once the night is over and
 * an hour or more off, the board's list and the day's reminders still to come
 * are written again with the real one. No second WhatsApp. Once: whoever moves
 * `night_minutes` first does it.
 */
async function refreshMorning(now: Date, plan: BedtimePlan, nights: Night[]): Promise<boolean> {
  const day = localDay(now);
  const slept = sleptInto(nights, day);
  if (slept === null || !nightOver(nights[0]!.end, nights[0]!.seen ?? null, plan.wakeMinutes, now)) return false;
  const [note] = await db
    .select({ id: assistantMessages.id, status: assistantMessages.status, nightMinutes: assistantMessages.nightMinutes })
    .from(assistantMessages)
    .where(and(eq(assistantMessages.kind, "morning"), eq(assistantMessages.day, day)))
    .limit(1);
  if (!note || note.status === "writing" || Math.abs(slept - (note.nightMinutes ?? 0)) < OFF_BY) return false;
  const was = note.nightMinutes === null ? isNull(assistantMessages.nightMinutes) : eq(assistantMessages.nightMinutes, note.nightMinutes);
  const [claimed] = await db
    .update(assistantMessages)
    .set({ nightMinutes: slept })
    .where(and(eq(assistantMessages.id, note.id), was))
    .returning({ id: assistantMessages.id });
  if (!claimed) return false;

  const cap = Math.max(0, (await dayReminderCap(now)) - (await dayRemindersSent(day)));
  const before = note.nightMinutes === null ? "sin la noche" : `con ${hm(note.nightMinutes)} de sueño`;
  const context = `${await buildContext(now)}\n\nLa nota de esta mañana salió ${before}; la noche ya ha terminado y ha sido de ${hm(slept)}. Rehaz la lista de hoy y los avisos que quedan con la noche de verdad.`;
  // One try: a model down all day is not a call every ten minutes.
  const written = await writeMessage("morning", plan, context, cap);
  if (!written.ok) return false;
  await db.update(assistantMessages).set({ items: written.items }).where(eq(assistantMessages.id, note.id));
  const titles = written.items.map((i) => i.title);
  await replaceDayReminders(day, now, pickReminders(written.avisos, titles, localMinutes(now), plan.bedMinutes, cap));
  return true;
}

/** When he last told his mood, today or yesterday. */
async function lastMood(now: Date): Promise<Date | null> {
  const rows = await db
    .select({ at: facts.at, data: facts.data })
    .from(facts)
    .where(and(eq(facts.kind, "other"), gte(facts.at, new Date(now.getTime() - 86_400_000))))
    .orderBy(desc(facts.at));
  return rows.find((r) => isMood(r.data as FactData))?.at ?? null;
}
