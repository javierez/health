/**
 * Reads the finished WhatsApp days not read yet with this `WA_VERSION`. The
 * daily sync reads only yesterday; this is the backlog, after the history
 * import or a prompt bump. Days under 20 messages are never read.
 *
 *   set -a && source .env.local && set +a && pnpm tsx scripts/read-whatsapp.ts            # dry: days and cost
 *   … scripts/read-whatsapp.ts --write                                                     # read them all
 *   … scripts/read-whatsapp.ts --write --days 30                                           # only the newest 30
 *
 * Each day is one Sonnet call (and its voice notes of the last two weeks,
 * transcribed; older ones WhatsApp no longer keeps).
 */
import { localDay } from "~/lib/day";
import { pendingDays, readDays } from "~/server/evolution/sync";

const write = process.argv.includes("--write");
const daysArg = process.argv.indexOf("--days");
const limit = daysArg > 0 ? Number(process.argv[daysArg + 1]) : 10_000;

// Sonnet 5 at $2 in / $10 out per million (scripts/probe-cost.ts); ~3.5 characters a token in Spanish,
// the 80,000-character cap a day, ~1,300 tokens of prompt and ~1,500 out.
const pending = await pendingDays(localDay(new Date()), limit);
const input = pending.reduce((s, d) => s + Math.min(d.chars, 80_000) / 3.5 + 1_300, 0);
const output = pending.length * 1_500;
const usd = (input * 2 + output * 10) / 1_000_000;
console.log(
  `${pending.length} days to read (${pending.at(-1)?.day ?? "·"} to ${pending[0]?.day ?? "·"}), ` +
    `${pending.reduce((s, d) => s + d.messages, 0).toLocaleString("es-ES")} messages, about $${usd.toFixed(2)}`,
);

if (write && pending.length > 0) {
  const errors: string[] = [];
  const read = await readDays({ before: localDay(new Date()), limit, errors });
  for (const d of read) console.log(`${d.day} ${d.ok ? "read" : "✗"} · ${d.heard} voice notes`);
  for (const e of errors) console.error(`  ${e}`);
}
process.exit(0);
