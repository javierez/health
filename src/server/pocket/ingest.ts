import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { localDay } from "~/lib/day";
import { db } from "~/db";
import { episodes, facts, recordings } from "~/db/schema";
import { env } from "~/env";
import { extractEpisodes } from "~/server/classify/episodes";
import { extractFacts, FACTS_VERSION, placeFact } from "~/server/classify/facts";
import { triage } from "~/server/classify/triage";
import {
  describePocketFailure,
  getPocketRecording,
  listPocketRecordings,
  type PocketRecordingDetail,
} from "./client";
import { readTonesStored, untoned } from "~/server/pocket/tones";
import { readSyncState, writeSyncState } from "~/server/queries/sync-state";
import { learnMovesLater } from "~/server/training/learn";

/**
 * The sweep: pull recordings from Pocket, store them raw, then classify what
 * has no live classification yet.
 *
 * Store-then-classify is two passes on purpose. Ingest is cheap and idempotent;
 * classification costs money and can fail. Splitting them means a bad Anthropic
 * minute never loses a transcript — the row is already down, and the next sweep
 * picks up exactly the ones still missing a classification.
 *
 * The sweep re-reads a few days back rather than only since the cursor, because
 * a recording synced from the device days late lands with its ORIGINAL
 * `recording_at`. A strict cursor would step straight over it.
 */
const OVERLAP_DAYS = 3;

/** Bump when `triage.ts` thresholds move, same as PROMPT_VERSION. */
const TRIAGE_VERSION = "triage-v1";

export interface SweepReport {
  fetched: number;
  stored: number;
  classified: number;
  episodes: number;
  facts: number;
  tones: number;
  failures: { recordingId: string; stage: "fetch" | "classify" | "facts" | "tones"; detail: string }[];
}

function daysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Upsert one recording. Returns false only if it could not be written. */
async function storeRecording(detail: PocketRecordingDetail): Promise<void> {
  const row = {
    id: detail.id,
    source: "pocket" as const,
    title: detail.title,
    durationSeconds: detail.duration === null ? null : Math.round(detail.duration),
    recordedAt: detail.recordedAt ? new Date(detail.recordedAt) : null,
    language: detail.language,
    state: detail.state,
    transcript: detail.transcriptText,
    summaryMarkdown: detail.summaryMarkdown,
    turns: detail.turns,
    actionItems: detail.actionItems,
    tags: detail.tags,
    raw: detail.raw,
    updatedAt: new Date(),
  };

  await db
    .insert(recordings)
    .values(row)
    .onConflictDoUpdate({ target: recordings.id, set: row });
}

/**
 * Classify one stored recording and file the result as the current one.
 *
 * The previous classification is retired inside the same transaction as the
 * insert. Doing it in two statements left a window where a partial unique index
 * on `is_current` rejected the new row and the recording ended up with none.
 */
export async function classifyStored(recordingId: string): Promise<
  { ok: true; episodes: number } | { ok: false; detail: string }
> {
  const [row] = await db
    .select()
    .from(recordings)
    .where(eq(recordings.id, recordingId))
    .limit(1);
  if (!row) return { ok: false, detail: "recording not stored" };

  // The day this counts towards, in the machine's local timezone. Local and not
  // UTC because a 23:40 recording belongs to that evening, not to tomorrow.
  const day = row.recordedAt ? localDay(row.recordedAt) : null;

  // The cheap pass first. A third of the corpus never reaches Claude.
  const verdict = triage({
    transcript: row.transcript,
    summaryMarkdown: row.summaryMarkdown,
    durationSeconds: row.durationSeconds,
  });

  let values: (typeof episodes.$inferInsert)[];

  if (verdict.kind === "classify") {
    const result = await extractEpisodes({
      title: row.title,
      turns: row.turns ?? [],
      transcript: row.transcript,
      summaryMarkdown: row.summaryMarkdown,
      durationSeconds: row.durationSeconds,
      recordedAt: row.recordedAt?.toISOString() ?? null,
    });
    if (!result.ok) return { ok: false, detail: `${result.reason}: ${result.detail ?? ""}` };

    values = result.data.episodes.map((e, seq) => ({
      recordingId,
      seq,
      category: e.category,
      subcategory: e.subcategory,
      confidence: e.confidence,
      kind: e.kind,
      counterpart: e.counterpart,
      oneLiner: e.oneLiner,
      topics: e.topics,
      people: e.people,
      call: e.call,
      startSeconds: e.startSeconds,
      endSeconds: e.endSeconds,
      durationSeconds: e.durationSeconds,
      day,
      model: result.data.model,
      promptVersion: result.data.promptVersion,
    }));
  } else {
    // `model: "triage"` so a later query can tell what cost money and what did
    // not, and so re-running the LLM over the noise bucket stays one filter.
    values = [
      {
        recordingId,
        seq: 0,
        category: "noise",
        kind: null,
        counterpart: null,
        subcategory:
          verdict.kind === "failed-transcription" ? "failed transcription" : "misfire",
        confidence: 1,
        oneLiner: verdict.note,
        topics: [],
        people: [],
        startSeconds: 0,
        endSeconds: row.durationSeconds ?? 0,
        // Noise contributes ZERO minutes to a day. It happened, but counting a
        // pocket-dial as two seconds of anything would be a lie in every total.
        durationSeconds: 0,
        day,
        model: "triage",
        promptVersion: TRIAGE_VERSION,
      },
    ];
  }

  await db.transaction(async (tx) => {
    // Retire the whole previous SET, not one row: a re-run can return a
    // different number of episodes, and the partial unique index on
    // (recording_id, seq) where is_current would reject the overlap.
    await tx
      .update(episodes)
      .set({ isCurrent: false })
      .where(and(eq(episodes.recordingId, recordingId), eq(episodes.isCurrent, true)));
    await tx.insert(episodes).values(values);
    // New episodes have no tone yet: the next sweep reads them.
    await tx.update(recordings).set({ tonesVersion: null }).where(eq(recordings.id, recordingId));
  });

  return { ok: true, episodes: values.length };
}

/**
 * Read one classified recording for meals, training and medical facts, and
 * replace whatever an earlier pass left. A recording that triage binned as
 * noise is marked read without a call: a pocket-dial has no lunch in it.
 */
export async function extractFactsStored(recordingId: string): Promise<
  { ok: true; facts: number } | { ok: false; detail: string }
> {
  const [row] = await db.select().from(recordings).where(eq(recordings.id, recordingId)).limit(1);
  if (!row?.recordedAt) return { ok: false, detail: "recording not stored or undated" };
  const recordedAt = row.recordedAt;

  const [real] = await db
    .select({ id: episodes.id })
    .from(episodes)
    .where(and(eq(episodes.recordingId, recordingId), eq(episodes.isCurrent, true), ne(episodes.category, "noise")))
    .limit(1);

  let values: (typeof facts.$inferInsert)[] = [];
  if (real) {
    const result = await extractFacts({
      title: row.title,
      turns: row.turns ?? [],
      transcript: row.transcript,
      summaryMarkdown: row.summaryMarkdown,
      durationSeconds: row.durationSeconds,
      recordedAt: recordedAt.toISOString(),
    });
    if (!result.ok) return { ok: false, detail: result.detail };
    values = result.facts.map((f) => {
      const at = placeFact(recordedAt, f);
      return {
        recordingId,
        kind: f.kind,
        at,
        day: localDay(at),
        summary: f.summary,
        data: f.data,
        evidence: f.evidence,
        confidence: f.confidence,
        model: result.model,
        promptVersion: FACTS_VERSION,
      };
    });
  }

  await db.transaction(async (tx) => {
    await tx.delete(facts).where(eq(facts.recordingId, recordingId));
    if (values.length > 0) await tx.insert(facts).values(values);
    await tx.update(recordings).set({ factsVersion: FACTS_VERSION }).where(eq(recordings.id, recordingId));
  });
  learnMovesLater(values);
  return { ok: true, facts: values.length };
}

/**
 * Re-run classification over everything already stored.
 *
 * Separate from `sweep`, which deliberately only touches recordings with no
 * live episodes — that is what makes the sweep cheap and idempotent. This is
 * the deliberate, paid-for pass you run after changing the prompt, and it is
 * why episodes carry `promptVersion` and `isCurrent`: the previous set is
 * retired rather than deleted, so the two passes can be diffed afterwards.
 *
 * Recordings that triage bins cost nothing — `classifyStored` decides that
 * before reaching the model — so there is no point filtering them out here.
 */
export async function reclassifyAll(
  onProgress?: (done: number, total: number, title: string | null) => void,
): Promise<{ done: number; episodes: number; failures: { id: string; detail: string }[] }> {
  const rows = await db
    .select({ id: recordings.id, title: recordings.title })
    .from(recordings)
    .where(sql`${recordings.transcript} IS NOT NULL`)
    .orderBy(desc(recordings.recordedAt));

  const failures: { id: string; detail: string }[] = [];
  let done = 0;
  let episodeCount = 0;

  for (const row of rows) {
    const res = await classifyStored(row.id);
    if (res.ok) episodeCount += res.episodes;
    else failures.push({ id: row.id, detail: res.detail });
    done += 1;
    onProgress?.(done, rows.length, row.title);
  }

  return { done, episodes: episodeCount, failures };
}

/** Fetch + store one recording by id. The webhook path. */
export async function ingestOne(recordingId: string): Promise<
  { ok: true; classified: boolean } | { ok: false; detail: string }
> {
  const detail = await getPocketRecording(env.POCKET_API_KEY, recordingId);
  if (!detail.ok) return { ok: false, detail: describePocketFailure(detail) };

  await storeRecording(detail.data);
  const classified = await classifyStored(recordingId);
  if (classified.ok) await extractFactsStored(recordingId);
  return { ok: true, classified: classified.ok };
}

/**
 * The periodic sweep. Safe to run as often as you like — it is idempotent.
 *
 * 🚨 Bounded by `budgetMs`, not by a count. After 39 days without a sync the
 * backlog is hundreds of recordings, and a function that dies at 300 s halfway
 * through a write never records how far it got. Stopping early on purpose
 * leaves the rest for the next tick, newest first.
 */
export async function sweep(
  opts: { since?: string; limit?: number; budgetMs?: number } = {},
): Promise<SweepReport> {
  const deadline = Date.now() + (opts.budgetMs ?? 200_000);
  const report: SweepReport = { fetched: 0, stored: 0, classified: 0, episodes: 0, facts: 0, tones: 0, failures: [] };

  const state = await readSyncState("pocket");
  const since =
    opts.since ??
    (state?.cursorDate
      ? // Step back from the cursor: late device syncs keep their original date.
        daysAgo(
          Math.max(
            OVERLAP_DAYS,
            Math.round((Date.now() - Date.parse(state.cursorDate)) / 86_400_000) + OVERLAP_DAYS,
          ),
        )
      : daysAgo(30));

  // Every page: after weeks without a sync there are more than 100.
  const limit = opts.limit ?? 100;
  const summaries: Extract<Awaited<ReturnType<typeof listPocketRecordings>>, { ok: true }>["data"] = [];
  for (let page = 1; page <= 20; page += 1) {
    const list = await listPocketRecordings(env.POCKET_API_KEY, { since, limit, page });
    if (!list.ok) {
      await writeSyncState("pocket", { lastError: describePocketFailure(list) });
      report.failures.push({ recordingId: "-", stage: "fetch", detail: describePocketFailure(list) });
      return report;
    }
    summaries.push(...list.data);
    if (list.data.length < limit) break;
  }

  report.fetched = summaries.length;

  // A completed recording already stored with its transcript does not change:
  // re-reading three days of them every ten minutes is thousands of calls a day.
  const ids = summaries.map((r) => r.id);
  const have = new Set(
    ids.length === 0
      ? []
      : (
          await db
            .select({ id: recordings.id })
            .from(recordings)
            .where(and(inArray(recordings.id, ids), sql`${recordings.transcript} IS NOT NULL`))
        ).map((r) => r.id),
  );

  for (const summary of summaries) {
    // Only `completed` carries a transcript; the rest come back next sweep.
    if (summary.state !== "completed" || have.has(summary.id)) continue;
    if (Date.now() > deadline) break;

    const detail = await getPocketRecording(env.POCKET_API_KEY, summary.id);
    if (!detail.ok) {
      report.failures.push({
        recordingId: summary.id,
        stage: "fetch",
        detail: describePocketFailure(detail),
      });
      continue;
    }
    await storeRecording(detail.data);
    report.stored += 1;
  }

  // Second pass: everything stored that has no live classification, including
  // rows left behind by earlier sweeps that hit an Anthropic error.
  const pending = await db
    .select({ id: recordings.id })
    .from(recordings)
    .leftJoin(
      episodes,
      and(eq(episodes.recordingId, recordings.id), eq(episodes.isCurrent, true)),
    )
    .where(and(isNull(episodes.id), sql`${recordings.transcript} IS NOT NULL`))
    .groupBy(recordings.id, recordings.recordedAt)
    .orderBy(desc(recordings.recordedAt));

  for (const { id } of pending) {
    if (Date.now() > deadline) break;
    const res = await classifyStored(id);
    if (res.ok) {
      report.classified += 1;
      report.episodes += res.episodes;
    } else {
      report.failures.push({ recordingId: id, stage: "classify", detail: res.detail });
    }
  }

  // Third pass: classified recordings not yet read for facts, newest first —
  // tonight's dinner matters to the bedtime alert, last month's does not.
  const unread = await db
    .select({ id: recordings.id })
    .from(recordings)
    .innerJoin(episodes, and(eq(episodes.recordingId, recordings.id), eq(episodes.isCurrent, true)))
    .where(or(isNull(recordings.factsVersion), ne(recordings.factsVersion, FACTS_VERSION)))
    .groupBy(recordings.id, recordings.recordedAt)
    .orderBy(desc(recordings.recordedAt));

  for (const { id } of unread) {
    if (Date.now() > deadline) break;
    const res = await extractFactsStored(id);
    if (res.ok) report.facts += res.facts;
    else report.failures.push({ recordingId: id, stage: "facts", detail: res.detail });
  }

  // Fourth pass: how each conversation went, newest first.
  for (const id of await untoned()) {
    if (Date.now() > deadline) break;
    const res = await readTonesStored(id);
    if (res.ok) report.tones += res.tones;
    else report.failures.push({ recordingId: id, stage: "tones", detail: res.detail });
  }

  // The cursor only moves once everything up to now is in: a pass cut short
  // by the budget starts from the same place next time.
  const finished = Date.now() <= deadline;
  await writeSyncState("pocket", {
    lastSweptAt: new Date(),
    ...(finished ? { cursorDate: new Date().toISOString().slice(0, 10) } : {}),
    lastError: null,
  });

  return report;
}
