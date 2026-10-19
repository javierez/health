/**
 * Read recordings for meals, training and medical facts by hand. The sweep
 * already does this on its own, newest first; this is for one recording or
 * to check the prompt.
 *
 *   set -a && source .env.local && set +a && pnpm tsx scripts/extract-facts.ts <recordingId> [...]
 */
import { extractFactsStored } from "~/server/pocket/ingest";

for (const id of process.argv.slice(2)) {
  const res = await extractFactsStored(id);
  console.log(id, res.ok ? `${res.facts} facts` : `✗ ${res.detail}`);
}
process.exit(0);
