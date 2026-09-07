/**
 * Haiku 4.5 against Sonnet 5 on the SAME stored recordings.
 *
 * Reads what is already in the database — no Pocket calls, so it can be re-run
 * without burning the rate limit — re-extracts with a second model and diffs.
 *
 * What matters is not whether the two agree on a label. It is whether they
 * agree on WHERE the episode boundaries fall, because everything downstream is
 * a sum of minutes: a model that merges a 40-minute call into one business
 * block loses the ten minutes of family talk inside it, and no category
 * accuracy makes that back.
 *
 *   set -a && source .env.local && set +a \
 *     && pnpm tsx scripts/probe-model-bakeoff.ts --n 10
 */
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "~/db";
import { episodes, recordings } from "~/db/schema";
import { extractEpisodes } from "~/server/classify/episodes";
import { formatSpan } from "~/lib/categories";

/** $ per million tokens, from the Claude API pricing table. */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

const CHALLENGER = "claude-haiku-4-5";

async function main() {
  const args = process.argv.slice(2);
  const n = args.includes("--n") ? Number(args[args.indexOf("--n") + 1]) : 10;

  // The longest recordings, because that is where segmentation is hard. A
  // three-minute note is one episode under any model.
  const rows = await db
    .select()
    .from(recordings)
    .where(and(isNotNull(recordings.transcript), sql`length(${recordings.transcript}) >= 200`))
    .orderBy(desc(recordings.durationSeconds))
    .limit(n);

  if (rows.length === 0) {
    console.log("Nothing stored yet. Run scripts/sync.ts first.");
    return;
  }

  let champCost = 0;
  let challCost = 0;
  let champEpisodes = 0;
  let challEpisodes = 0;
  let sameCount = 0;
  let challMs = 0;

  console.log(`${rows.length} recording(s), longest first\n`);

  for (const row of rows) {
    const stored = await db
      .select()
      .from(episodes)
      .where(and(eq(episodes.recordingId, row.id), eq(episodes.isCurrent, true)))
      .orderBy(episodes.seq);
    if (stored.length === 0) continue;

    const champModel = stored[0]!.model;

    const t0 = Date.now();
    const res = await extractEpisodes(
      {
        title: row.title,
        turns: row.turns ?? [],
        transcript: row.transcript,
        summaryMarkdown: row.summaryMarkdown,
        durationSeconds: row.durationSeconds,
        recordedAt: row.recordedAt?.toISOString() ?? null,
      },
      { model: CHALLENGER },
    );
    challMs += Date.now() - t0;

    if (!res.ok) {
      console.log(`  ✗ ${row.title ?? row.id}: ${res.reason} ${res.detail ?? ""}`);
      continue;
    }

    const price = PRICES[CHALLENGER]!;
    challCost += (res.data.inputTokens / 1e6) * price.input + (res.data.outputTokens / 1e6) * price.output;
    // The champion's own token count was not stored; approximate from the same
    // input, since the prompt and transcript are identical.
    const champPrice = PRICES[champModel] ?? price;
    champCost +=
      (res.data.inputTokens / 1e6) * champPrice.input +
      (res.data.outputTokens / 1e6) * champPrice.output;

    champEpisodes += stored.length;
    challEpisodes += res.data.episodes.length;

    const champCats = stored.map((e) => e.category).join(">");
    const challCats = res.data.episodes.map((e) => e.category).join(">");
    if (champCats === challCats) sameCount += 1;

    const mark = champCats === challCats ? "=" : "≠";
    console.log(`  ${mark} ${(row.title ?? "(untitled)").slice(0, 44).padEnd(44)} ${formatSpan(row.durationSeconds ?? 0)}`);
    console.log(`      ${champModel.padEnd(17)} ${stored.length} ep  ${champCats}`);
    console.log(`      ${CHALLENGER.padEnd(17)} ${res.data.episodes.length} ep  ${challCats}`);
  }

  console.log(
    `\nepisodes: champion ${champEpisodes} · ${CHALLENGER} ${challEpisodes}` +
      `\nidentical segmentation: ${sameCount}/${rows.length}` +
      `\ncost on this sample: champion ~$${champCost.toFixed(4)} · ${CHALLENGER} ~$${challCost.toFixed(4)}` +
      `\n${CHALLENGER} latency: ${Math.round(challMs / rows.length / 1000)}s per recording`,
  );
}

await main();
