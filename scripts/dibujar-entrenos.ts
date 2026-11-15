/**
 * The 3D drawings his trainings are missing, and the ones drawn wrong
 * (Javier, 14-nov-2026: «haz todos los 3Ds que faltan»). The 21-oct leg
 * session was never learned, the band's «Pesas» and «Andar» have no drawing,
 * and three came out with the wrong equipment or pose.
 *
 * Dry run by default: lists what it would draw. `--aplicar` draws them one by
 * one through `learnMove` (web + one gpt-image-1.5 drawing, a few cents each).
 *
 *   DATABASE_URL="$(security find-generic-password -s salud-db -w)" APP_URL=https://pulso-ai.xyz \
 *     pnpm tsx scripts/dibujar-entrenos.ts [--aplicar] [--rehacer-fondos]
 */
import { eq } from "drizzle-orm";

import { asOwner, db } from "~/db";
import { exerciseMoves } from "~/db/schema";
import { exerciseName, exerciseOf, sportOf } from "~/lib/exercises";
import { kindKey } from "~/lib/renders";
import { learnMove } from "~/server/training/learn";

const MISSING: { name: string; byTime: boolean }[] = [
  { name: "Sentadilla isométrica en pared", byTime: false },
  { name: "Sentadilla isométrica en pared a una pierna", byTime: false },
  { name: "Zancada estática", byTime: false },
  { name: "Zancada estática con mancuernas", byTime: false },
  { name: "Puente de glúteo a una pierna con banda", byTime: false },
  { name: "Oso a pica", byTime: false },
  { name: "Sentadilla a una pierna con fitball", byTime: false },
  { name: "Pesas", byTime: true },
  { name: "Andar", byTime: true },
  // Today's, with the equipment in the name so the drawing carries it.
  { name: "Press inclinado con mancuernas", byTime: false },
  { name: "Aperturas en polea", byTime: false },
  // The band's sports of his WHOOP year.
  { name: "Fútbol", byTime: true },
  { name: "Natación", byTime: true },
  { name: "Pádel", byTime: true },
  { name: "Esquí", byTime: true },
  { name: "Spinning", byTime: true },
  { name: "Entrenamiento funcional", byTime: true },
  { name: "Marcha", byTime: true },
];
/** Drawn, but wrong: searched and drawn again from scratch. */
const REDO = process.argv.includes("--rehacer-fondos") ? ["fondos"] : [];

const canonical = (name: string) => (exerciseOf(name) ? exerciseName(name) : (sportOf(name)?.name ?? name.trim()));

async function main() {
  const apply = process.argv.includes("--aplicar");
  const plan: { key: string; name: string; byTime: boolean; now: string; redo: boolean }[] = [];
  for (const m of MISSING) {
    const name = canonical(m.name);
    const key = kindKey(name);
    if (!key) continue;
    const [row] = await db.select().from(exerciseMoves).where(eq(exerciseMoves.key, key));
    if (row?.status === "ready") continue;
    if (!plan.some((p) => p.key === key)) plan.push({ key, name, byTime: m.byTime, now: row?.status ?? "nuevo", redo: false });
  }
  for (const key of REDO) {
    const [row] = await db.select().from(exerciseMoves).where(eq(exerciseMoves.key, key));
    if (row) plan.push({ key, name: row.name, byTime: row.byTime, now: row.status, redo: true });
  }
  for (const p of plan) console.log(`${p.redo ? "rehacer" : "dibujar"}  ${p.key}  «${p.name}»  (${p.now})`);
  console.log(`${plan.length} dibujos${apply ? "" : " · en seco, sin --aplicar no se escribe ni se paga nada"}`);
  if (!apply) return;

  for (const p of plan) {
    if (p.redo) {
      await db.update(exerciseMoves).set({ status: "pending", info: null, attempts: 0, error: null, updatedAt: new Date() }).where(eq(exerciseMoves.key, p.key));
    } else {
      await db.insert(exerciseMoves).values({ key: p.key, name: p.name, byTime: p.byTime }).onConflictDoNothing();
    }
    const r = await learnMove(p.key);
    console.log(`${p.key}: ${r.ok ? "listo" : `falló, ${r.error}`}`);
  }
}

asOwner(main)
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
