/**
 * His whole WhatsApp history from the Evolution instance, once. The daily
 * sync only reaches back to the newest message it has; this pages the rest
 * (52,758 messages on 16-oct-2026: 1,056 pages of 50, about nine minutes).
 * Reading Evolution is free; reading the days with the model is
 * `scripts/read-whatsapp.ts`, after this.
 *
 *   set -a && source .env.local && set +a && pnpm tsx scripts/import-whatsapp.ts            # dry: counts only
 *   … scripts/import-whatsapp.ts --write                                                    # import, no model
 *   … scripts/import-whatsapp.ts --write --since=2026-10-20                                 # only back to that day: a gap after a re-pair
 *
 * Read only on the WhatsApp side (`~/server/evolution/client`): nothing is
 * sent or marked read.
 */
import { sql } from "drizzle-orm";

import { db } from "~/db";
import { waMessages } from "~/db/schema";
import { evolutionReady } from "~/server/evolution/client";
import { importMessages } from "~/server/evolution/sync";

const write = process.argv.includes("--write");
const since = process.argv.find((a) => a.startsWith("--since="))?.slice("--since=".length);

if (!evolutionReady()) {
  console.error("EVOLUTION_API_URL, EVOLUTION_INSTANCE and EVOLUTION_API_KEY are needed");
  process.exit(1);
}

const t0 = Date.now();
const res = await importMessages({
  stopBefore: since ? new Date(`${since}T00:00:00Z`) : null,
  maxPages: Number.POSITIVE_INFINITY,
  write,
  onPage: (p, of) => {
    if (p % 50 === 0 || p === of) console.log(`page ${p} of ${of}`);
  },
});
console.log(
  `${write ? "imported" : "dry run"}: ${res.seen} records on ${res.pages} pages, ${res.written} new rows, ` +
    `${res.oldest?.toISOString().slice(0, 10)} to ${res.newest?.toISOString().slice(0, 10)}, ${Math.round((Date.now() - t0) / 1000)} s`,
);

if (write) {
  const [count] = await db
    .select({ rows: sql<number>`count(*)::int`, chats: sql<number>`count(distinct ${waMessages.chat})::int` })
    .from(waMessages);
  console.log(`wa_messages: ${count?.rows} rows, ${count?.chats} chats`);
}
process.exit(0);
