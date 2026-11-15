import { notLike, sql } from "drizzle-orm";

import { asOwner, db } from "~/db";
import { whoopRecords } from "~/db/schema";
import { env } from "~/env";
import { localDay } from "~/lib/day";
import { askAfterTraining } from "~/server/agent/after-training";
import { sendDueReminders } from "~/server/agent/reminders";
import { runAssistant } from "~/server/assistant/run";
import { sendNotice, whatsappConfigured } from "~/server/assistant/whatsapp";
import { evolutionReady, TOKEN_DEAD, tokenDead } from "~/server/evolution/client";
import { interpret } from "~/server/insights/interpret";
import { proposeHypotheses } from "~/server/insights/propose";
import { syncWhatsapp } from "~/server/evolution/sync";
import { syncGithub } from "~/server/github/sync";
import { sweep } from "~/server/pocket/ingest";
import { readSyncState, writeSyncState } from "~/server/queries/sync-state";
import { syncWhoop } from "~/server/whoop/sync";

/**
 * Every source in one pass, then the assistant: Pocket, WHOOP, GitHub and,
 * every four hours, his WhatsApp. Once a week, the AI's new things to compare. Each
 * one is incremental and fails on its own, so a dead WHOOP token never stops
 * the transcripts, and the assistant writes with whatever did arrive. The
 * reminders he asked for go first: they cannot wait for a slow sweep.
 *
 * Callers: the 10-minute tick, the daily cron, the board when it is stale,
 * the sync button.
 *
 * Always as him, whoever starts it: the Pocket, WHOOP, GitHub and WhatsApp
 * keys are his, so is what they bring (`~/db`, 13-nov-2026).
 */
export function syncEverything() {
  return asOwner(syncAll);
}

async function syncAll() {
  // The demo has no sources and spends nothing: its data is seeded.
  if (env.DEMO_MODE) return { demo: true };
  // The question after training joins the reminders, so it leaves in this same pass.
  await askAfterTraining().catch((err: unknown) => console.error("[after-training]", err));
  const reminders = await sendDueReminders().catch((err: unknown) => ({ error: String(err) }));
  const [pocket, whoop, github, whatsapp] = await Promise.allSettled([
    sweep(),
    syncWhoopRecent(),
    syncGithubHourly(),
    syncWhatsappEvery4h(),
  ]);
  const assistant = await runAssistant().catch((err: unknown) => ({ error: String(err) }));
  const hypotheses = await proposeWeekly().catch((err: unknown) => ({ error: String(err) }));
  const reading = await interpretWeekly().catch((err: unknown) => ({ error: String(err) }));
  return {
    reminders,
    pocket: settled(pocket),
    whoop: settled(whoop),
    github: settled(github),
    whatsapp: settled(whatsapp),
    assistant,
    hypotheses,
    reading,
  };
}

/** New things to compare, once a week, after the data of the day is in. */
async function proposeWeekly() {
  if (!(await olderThan("hypotheses", 7 * 24 * 60))) return { skipped: "proposed this week already" };
  return run("hypotheses", () => proposeHypotheses());
}

/** The interpreter's reading of everything, once a week, after the new hypotheses are in. */
async function interpretWeekly() {
  // A failed reading tries again the next day, not the next week: 4-nov-2026 left the 21-oct one up for 17 days.
  const failed = (await readSyncState("reading"))?.lastError;
  if (!(await olderThan("reading", (failed ? 1 : 7) * 24 * 60))) return { skipped: "read this week already" };
  return run("reading", () => interpret());
}

/**
 * His WhatsApp every four hours (14-nov-2026; once a day before): today is
 * read as it goes, and his partner's voice notes and photos are in before
 * WhatsApp drops them. A dead token is told to him once a day until it is fixed.
 */
async function syncWhatsappEvery4h(now = new Date()) {
  if (!evolutionReady()) return { skipped: "Evolution not configured" };
  const state = await readSyncState("whatsapp");
  const last = state?.lastSweptAt?.getTime() ?? 0;
  if (now.getTime() - last < 4 * 3_600_000) return { skipped: "read less than four hours ago" };
  const report = await run("whatsapp", () => syncWhatsapp(now));
  const toldToday = state?.lastSweptAt && localDay(state.lastSweptAt) === localDay(now) && tokenDead([state.lastError ?? ""]);
  if (tokenDead(report.errors) && !toldToday && whatsappConfigured()) {
    const out = await sendNotice(TOKEN_DEAD, now);
    if (!out.ok) console.error(`[whatsapp] el aviso del token no salió: ${out.detail}`);
  }
  return report;
}

/** GitHub's search budget is 30 a minute; once an hour is plenty for commits. */
async function syncGithubHourly() {
  if (!(await olderThan("github", 60))) return { skipped: "synced less than an hour ago" };
  return run("github", () => syncGithub());
}

/**
 * 🚨 WHOOP re-scores sleep and recovery hours after they start, so the window
 * reaches back three days from the newest row instead of starting at it.
 */
export async function syncWhoopRecent() {
  const [row] = await db
    .select({ last: sql<string | null>`(max(${whoopRecords.startAt}) - interval '3 days')::text` })
    .from(whoopRecords)
    // The band's stand-ins are newer than WHOOP's last row once it stops; they must not move WHOOP's window.
    .where(notLike(whoopRecords.externalId, "edge-%"));
  return run("whoop", () => syncWhoop({ since: row?.last ?? undefined }));
}

/** True when `source` last ran more than `minutes` ago (or never). */
export async function olderThan(source: string, minutes: number) {
  const state = await readSyncState(source);
  const last = state?.lastSweptAt?.getTime() ?? 0;
  return Date.now() - last > minutes * 60_000;
}

async function run<T extends { errors: string[] }>(source: string, fn: () => Promise<T>) {
  const report = await fn();
  await writeSyncState(source, {
    lastSweptAt: new Date(),
    lastError: report.errors[0] ?? null,
  });
  return report;
}

function settled<T>(r: PromiseSettledResult<T>) {
  return r.status === "fulfilled" ? r.value : { error: String(r.reason) };
}
