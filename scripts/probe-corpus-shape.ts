/**
 * How long are the recordings, really?
 *
 * Written because the first classification pass put 8 of 14 recordings in
 * `other`, and reading them showed they were not misclassified — they were
 * misfires: silence, a hang-up, the single word "Meta". Before designing a
 * filter, measure where the cliff actually is.
 *
 *   set -a && source .env.local && set +a \
 *     && SKIP_ENV_VALIDATION=1 pnpm tsx scripts/probe-corpus-shape.ts
 */
import { getPocketRecording, listPocketRecordings } from "~/server/pocket/client";

const KEY = process.env.POCKET_API_KEY ?? "";

async function main() {
  const list = await listPocketRecordings(KEY, { limit: 100 });
  if (!list.ok) {
    console.error(`✗ Pocket: ${list.reason}`);
    process.exitCode = 1;
    return;
  }
  const done = list.data.filter((r) => r.state === "completed");

  const rows: { chars: number; secs: number; title: string }[] = [];
  for (const s of done) {
    const d = await getPocketRecording(KEY, s.id);
    if (!d.ok) continue;
    rows.push({
      chars: d.data.transcriptText?.length ?? 0,
      secs: Math.round(d.data.duration ?? 0),
      title: d.data.title ?? "(untitled)",
    });
  }

  rows.sort((a, b) => a.chars - b.chars);
  for (const r of rows.slice(0, 40)) {
    console.log(`${String(r.chars).padStart(6)}  ${String(r.secs).padStart(5)}s  ${r.title.slice(0, 52)}`);
  }

  const buckets = [0, 1, 50, 100, 200, 400, 1000, 5000];
  console.log("\n chars   count");
  for (let i = 0; i < buckets.length; i++) {
    const lo = buckets[i]!;
    const hi = buckets[i + 1] ?? Infinity;
    console.log(`${String(lo).padStart(6)}+  ${rows.filter((r) => r.chars >= lo && r.chars < hi).length}`);
  }
  console.log(`\ntotal ${rows.length}`);
}

await main();
