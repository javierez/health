/**
 * In seco: what the chat would send when he is done training, at a given time
 * (`~/server/training/done`), and that session's page. Reads only.
 *
 *   DATABASE_URL="$(security find-generic-password -s salud-db -w)" APP_URL=https://pulso-ai.xyz \
 *     pnpm tsx scripts/probe-enlace-entreno.ts [2026-11-14T20:10:00Z]
 */
import { asOwner } from "~/db";
import { localDay } from "~/lib/day";
import { loadWorkout } from "~/server/queries/training";
import { doneLinkDue } from "~/server/training/done";

async function main() {
  const now = new Date(process.argv[2] ?? Date.now());
  console.log(`A las ${now.toISOString()}:`, await doneLinkDue(now));
  const view = await loadWorkout(localDay(now));
  if (!view) return console.log("Ese día no hay entreno.");
  console.log("\nPágina:", view.link);
  console.log("Números:", view.stats);
  console.log("Nota:", view.score);
  console.log("Pulso:", view.pulse.length, "minutos", view.pulse[0]?.t, "→", view.pulse.at(-1)?.t);
  for (const l of view.session.lines) console.log(`  ${l.name}${l.perHand ? " (mancuernas)" : ""}:`, l.detail.map((d) => `${d.kg ?? "-"}kg×${d.reps ?? "-"}${d.seconds ? ` ${d.seconds}s` : ""}`).join(" "));
}

asOwner(main)
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
