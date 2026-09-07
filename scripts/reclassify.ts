/**
 * The full paid pass. Run it after a PROMPT_VERSION bump.
 *
 * `--limit N` takes the N longest first, which is the honest sample: the long
 * recordings are the ones that carry several episodes and therefore actually
 * exercise the taxonomy. `--dry` just counts what would be spent.
 */
import { sql } from "drizzle-orm";

import { db } from "~/db";
import { PROMPT_VERSION } from "~/server/classify/episodes";
import { classifyStored } from "~/server/pocket/ingest";

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : null;
const dry = process.argv.includes("--dry");

const rows = await db.execute<{ id: string; title: string | null; seconds: number | null }>(sql`
  select r.id, r.title, r.duration_seconds as seconds
  from recordings r
  where not exists (
    select 1 from episodes e
    where e.recording_id = r.id and e.is_current and e.prompt_version = ${PROMPT_VERSION}
  )
  order by r.duration_seconds desc nulls last
  ${limit ? sql`limit ${limit}` : sql``}
`);

console.log(`${rows.length} recordings to re-run at ${PROMPT_VERSION}`);
if (dry) process.exit(0);

let ok = 0;
for (const r of rows) {
  const started = Date.now();
  const res = await classifyStored(r.id);
  const secs = Math.round((Date.now() - started) / 1000);
  const mins = Math.round((r.seconds ?? 0) / 60);
  if (res.ok) {
    ok += 1;
    console.log(`✓ ${mins}m ${r.title} → ${res.episodes} eps (${secs}s)`);
  } else {
    console.log(`✗ ${mins}m ${r.title} → ${res.detail}`);
  }
}
console.log(`${ok}/${rows.length} ok`);
process.exit(0);
