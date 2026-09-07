/**
 * Run a sweep from the terminal.
 *
 *   set -a && source .env.local && set +a && pnpm tsx scripts/sync.ts
 *   … --since 2026-08-01   walk further back than the cursor
 *   … --dry                list what Pocket has, write nothing
 */
import { listPocketRecordings } from "~/server/pocket/client";
import { reclassifyAll, sweep } from "~/server/pocket/ingest";

async function main() {
  const args = process.argv.slice(2);
  const since = args.includes("--since") ? args[args.indexOf("--since") + 1] : undefined;

  if (args.includes("--dry")) {
    const list = await listPocketRecordings(process.env.POCKET_API_KEY ?? "", { since, limit: 100 });
    if (!list.ok) {
      console.error(`✗ ${list.reason}${list.detail ? `: ${list.detail}` : ""}`);
      process.exit(1);
    }
    console.log(`${list.data.length} recording(s) since ${since ?? "the default window"}\n`);
    for (const r of list.data) {
      console.log(
        `  ${r.recordedAt?.slice(0, 16) ?? "?".padEnd(16)}  ${String(r.state).padEnd(10)}  ${r.title ?? "(untitled)"}`,
      );
    }
    return;
  }

  if (args.includes("--reclassify")) {
    const started = Date.now();
    const res = await reclassifyAll((done, total, title) => {
      console.log(`  ${String(done).padStart(3)}/${total}  ${title ?? "(untitled)"}`);
    });
    console.log(
      `\n${res.done} recordings · ${res.episodes} episodes · ` +
        `${Math.round((Date.now() - started) / 1000)}s`,
    );
    for (const f of res.failures) console.log(`  ✗ ${f.id}: ${f.detail}`);
    if (res.failures.length > 0) process.exitCode = 1;
    return;
  }

  const report = await sweep({ since });
  console.log(
    `fetched ${report.fetched} · stored ${report.stored} · ` +
      `classified ${report.classified} · ${report.episodes} episodes`,
  );
  for (const f of report.failures) {
    console.log(`  ✗ ${f.stage} ${f.recordingId}: ${f.detail}`);
  }
  if (report.failures.length > 0) process.exitCode = 1;
}

// Never process.exit() here: it kills in-flight writes mid-INSERT.
await main();
