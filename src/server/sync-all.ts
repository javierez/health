import { sql } from "drizzle-orm";

import { db } from "~/db";
import { whoopRecords } from "~/db/schema";
import { localDay } from "~/lib/day";
import { sendDueReminders } from "~/server/agent/reminders";
import { runAssistant } from "~/server/assistant/run";
import { evolutionReady } from "~/server/evolution/client";
import { proposeHypotheses } from "~/server/insights/propose";
import { syncWhatsapp } from "~/server/evolution/sync";
import { syncGithub } from "~/server/github/sync";
import { sweep } from "~/server/pocket/ingest";
import { readSyncState, writeSyncState } from "~/server/queries/sync-state";
import { syncWhoop } from "~/server/whoop/sync";

/**
 * Every source in one pass, then the assistant: Pocket, WHOOP, GitHub and,
 * once a day, his WhatsApp. Once a week, the AI's new things to compare. Each
 * one is incremental and fails on its own, so a dead WHOOP token never stops
 * the transcripts, and the assistant writes with whatever did arrive. The
 * reminders he asked for go first: they cannot wait for a slow sweep.
 *
 * Callers: the 10-minute tick, the daily cron, the board when it is stale,
 * the sync button.
 */
export async function syncEverything() {
  const reminders = await sendDueReminders().catch((err: unknown) => ({ error: String(err) }));
  const [pocket, whoop, github, whatsapp] = await Promise.allSettled([
    sweep(),
    syncWhoopRecent(),
    syncGithubHourly(),
    syncWhatsappDaily(),
  ]);
  const assistant = await runAssistant().catch((err: unknown) => ({ error: String(err) }));
  const hypotheses = await proposeWeekly().catch((err: unknown) => ({ error: String(err) }));
  return {
    reminders,
    pocket: settled(pocket),
    whoop: settled(whoop),
    github: settled(github),
    whatsapp: settled(whatsapp),
    assistant,
    hypotheses,
  };
}

/** New things to compare, once a week, after the data of the day is in. */
async function proposeWeekly() {
  if (!(await olderThan("hypotheses", 7 * 24 * 60))) return { skipped: "proposed this week already" };
  return run("hypotheses", () => proposeHypotheses());
}

/** His WhatsApp once a day, on the first tick after midnight in Madrid: yesterday is whole by then. */
async function syncWhatsappDaily(now = new Date()) {
  if (!evolutionReady()) return { skipped: "Evolution not configured" };
  const state = await readSyncState("whatsapp");
  if (state?.lastSweptAt && localDay(state.lastSweptAt) === localDay(now)) return { skipped: "read today already" };
  return run("whatsapp", () => syncWhatsapp(now));
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
    .from(whoopRecords);
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
