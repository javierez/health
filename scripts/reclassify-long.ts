/**
 * Re-runs only the recordings that the single-call classifier under-described:
 * anything past one window, plus anything left without current episodes.
 * The short ones are byte-identical requests under v3, so they are not re-spent.
 */
import { sql } from "drizzle-orm";

import { db } from "~/db";
import { classifyStored } from "~/server/pocket/ingest";

const rows = await db.execute<{ id: string; title: string | null; seconds: number | null }>(sql`
  select r.id, r.title, r.duration_seconds as seconds
  from recordings r
  where r.duration_seconds > 2700
     or not exists (select 1 from episodes e where e.recording_id = r.id and e.is_current)
  order by r.duration_seconds desc nulls last
`);

console.log(`${rows.length} recordings to re-run`);
let ok = 0;
for (const r of rows) {
  const started = Date.now();
  const res = await classifyStored(r.id);
  const secs = Math.round((Date.now() - started) / 1000);
  if (res.ok) {
    ok += 1;
    console.log(`✓ ${Math.round((r.seconds ?? 0) / 60)}m ${r.title} → ${res.episodes} eps (${secs}s)`);
  } else {
    console.log(`✗ ${Math.round((r.seconds ?? 0) / 60)}m ${r.title} → ${res.detail}`);
  }
}
console.log(`${ok}/${rows.length} ok`);
process.exit(0);
