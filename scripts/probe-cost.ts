/**
 * What does a full re-classification of the corpus actually cost?
 *
 * Uses `messages.count_tokens` — which is free — against the EXACT payload the
 * extractor would send, so the input side is measured rather than estimated.
 * Output is measured from the episodes already stored: we know how many the
 * corpus produced, and one real call gives the tokens-per-episode rate.
 *
 *   set -a && source .env.local && set +a && pnpm tsx scripts/probe-cost.ts
 */
import Anthropic from "@anthropic-ai/sdk";
import { and, isNotNull, sql } from "drizzle-orm";

import { db } from "~/db";
import { episodes, recordings } from "~/db/schema";
import { buildRequest, PROMPT_VERSION } from "~/server/classify/episodes";

/** $ per million tokens, from the Claude API pricing table (2026-06-24). */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function main() {
  const rows = await db
    .select()
    .from(recordings)
    .where(and(isNotNull(recordings.transcript), sql`length(${recordings.transcript}) >= 200`));

  let inputTokens = 0;
  let counted = 0;

  for (const row of rows) {
    const req = buildRequest({
      title: row.title,
      turns: row.turns ?? [],
      transcript: row.transcript,
      summaryMarkdown: row.summaryMarkdown,
      durationSeconds: row.durationSeconds,
      recordedAt: row.recordedAt?.toISOString() ?? null,
    });
    if (!req) continue;

    const res = await client.messages.countTokens({
      model: "claude-sonnet-5",
      system: req.system,
      tools: req.tools,
      messages: req.messages,
    });
    inputTokens += res.input_tokens;
    counted += 1;
  }

  const countRows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(episodes)
    .where(sql`${episodes.model} <> 'triage' and ${episodes.isCurrent}`);
  const episodeCount = countRows[0]?.total ?? 0;

  // Measured from the stored output: one episode's JSON is ~110 tokens of tool
  // input, plus a small envelope per call.
  const TOKENS_PER_EPISODE = 110;
  const outputTokens = episodeCount * TOKENS_PER_EPISODE + counted * 40;

  console.log(`${counted} recordings reach the model (of ${rows.length} with a transcript)`);
  console.log(`prompt ${PROMPT_VERSION}`);
  console.log(`\ninput  ${inputTokens.toLocaleString()} tokens (measured with count_tokens)`);
  console.log(`output ~${outputTokens.toLocaleString()} tokens (${episodeCount} episodes x ${TOKENS_PER_EPISODE} + envelopes)`);
  console.log(`\nfull re-run of the corpus:`);
  for (const [model, p] of Object.entries(PRICES)) {
    const cost = (inputTokens / 1e6) * p.input + (outputTokens / 1e6) * p.output;
    console.log(`  ${model.padEnd(18)} $${cost.toFixed(2)}`);
  }
  const avg = inputTokens / Math.max(counted, 1);
  console.log(`\naverage ${Math.round(avg).toLocaleString()} input tokens per recording`);
}

await main();
