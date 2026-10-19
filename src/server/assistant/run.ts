import { and, desc, eq, gte } from "drizzle-orm";

import { db } from "~/db";
import { assistantMessages, facts, type FactData } from "~/db/schema";
import { isMood } from "~/lib/trackers";
import { nudgeDue } from "~/server/commitments/standing";
import { loadCommitments } from "~/server/queries/commitments";
import { buildContext, loadNights } from "./context";
import { withMoodAsk } from "./mood-ask";
import { bedtimePlan, dueMessages, type BedtimePlan } from "./plan";
import { sendWhatsApp, whatsappConfigured } from "./whatsapp";
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
  const plan = bedtimePlan(nights, cap?.commitment.target ?? null);

  const recent = await db
    .select({ kind: assistantMessages.kind, day: assistantMessages.day })
    .from(assistantMessages)
    .where(gte(assistantMessages.createdAt, new Date(now.getTime() - 2 * 86_400_000)));
  const sent = new Set(recent.map((m) => `${m.kind}:${m.day}`));

  const lastWake = nights[0]?.end ?? null;
  const due = dueMessages(now, { plan, lastWake, sent });
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

    const written = await writeMessage(d.kind, plan, await buildContext(now));
    if (!written.ok) {
      await db
        .update(assistantMessages)
        .set({ status: "failed", error: written.detail })
        .where(eq(assistantMessages.id, claimed.id));
      continue;
    }

    const text = withMoodAsk(written.text, d.kind, await lastMood(now), now);
    const out = whatsappConfigured() ? await sendWhatsApp(text) : null;
    await db
      .update(assistantMessages)
      .set({
        body: text,
        items: written.items,
        status: out === null ? "not-configured" : out.ok ? "sent" : "failed",
        error: out && !out.ok ? out.detail : null,
        waMessageId: out?.ok ? out.id : null,
      })
      .where(eq(assistantMessages.id, claimed.id));
    done.push(`${d.kind}:${d.day}`);
  }

  return { plan, sent: done };
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
