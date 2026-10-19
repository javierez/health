/**
 * How each Pocket conversation went, the backlog (`~/server/classify/tones`).
 * The sweep reads the new ones on its own, newest first; this is the history,
 * after the first deploy or a TONES_VERSION bump.
 *
 *   set -a && source .env.local && set +a && pnpm tsx scripts/read-tones.ts                  # dry: how many and cost
 *   … scripts/read-tones.ts --write                                                           # read them all
 *   … scripts/read-tones.ts --write --limit 20                                                # only the newest 20
 */
import { readTonesStored, untoned, untonedChars } from "~/server/pocket/tones";

const write = process.argv.includes("--write");
const i = process.argv.indexOf("--limit");
const limit = i > 0 ? Number(process.argv[i + 1]) : Number.POSITIVE_INFINITY;

// Sonnet 5 at $2 in / $10 out per million; ~3.5 characters a token; ~900 tokens of prompt a call, ~60 out a conversation.
const todo = await untonedChars();
const usd = ((todo.chars / 3.5 + todo.recordings * 900) * 2 + todo.talks * 60 * 10) / 1_000_000;
console.log(`${todo.recordings} recordings, ${todo.talks} conversations, about $${usd.toFixed(2)}`);

if (write) {
  let n = 0;
  for (const id of (await untoned()).slice(0, limit)) {
    const res = await readTonesStored(id);
    n += 1;
    console.log(`${n} ${id} ${res.ok ? `${res.tones} read` : `✗ ${res.detail}`}`);
  }
}
process.exit(0);
