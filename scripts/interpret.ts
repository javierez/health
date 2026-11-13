/**
 * The interpreter's weekly reading, by hand: the sync runs it once a week on its own.
 *
 *   set -a && source .env.local && set +a && pnpm tsx scripts/interpret.ts           # dry: what the AI would read
 *   … scripts/interpret.ts --write                                                    # read it and save today's reading
 *
 * One Sonnet call, a few cents. The WHOOP screen shows it under «Conclusiones».
 */
import { interpret, interpretationContext } from "~/server/insights/interpret";

if (!process.argv.includes("--write")) {
  const context = await interpretationContext();
  console.log(context);
  console.log(`\n${context.length.toLocaleString("es-ES")} characters. Run with --write to ask the AI.`);
  process.exit(0);
}

const { summary, items, errors } = await interpret();
if (errors.length) console.error(`Failed:\n  ${errors.join("\n  ")}`);
else console.log(`${summary}\n\n${items.map((r, i) => `${i + 1}. ${r.title}\n   ${r.detail}`).join("\n")}`);
process.exit(0);
