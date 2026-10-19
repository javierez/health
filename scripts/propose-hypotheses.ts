/**
 * The weekly AI ideas, by hand: the sync runs this once a week on its own.
 *
 *   set -a && source .env.local && set +a && pnpm tsx scripts/propose-hypotheses.ts           # dry: what the AI would read
 *   … scripts/propose-hypotheses.ts --write                                                    # ask for them and save them
 *
 * One Sonnet call, a few cents. The engine tests what it proposes like the rest.
 */
import { proposalContext, proposeHypotheses } from "~/server/insights/propose";

if (!process.argv.includes("--write")) {
  const context = await proposalContext();
  console.log(context);
  console.log(`\n${context.length.toLocaleString("es-ES")} characters. Run with --write to ask the AI.`);
  process.exit(0);
}

const { added, errors } = await proposeHypotheses();
console.log(added.length ? `Added:\n  ${added.join("\n  ")}` : "Nothing added.");
if (errors.length) console.error(`Discarded:\n  ${errors.join("\n  ")}`);
process.exit(0);
