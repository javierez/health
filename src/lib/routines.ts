import type { Moment } from "~/db/schema";
import { kindKey } from "~/lib/renders";

/**
 * «Rutinas» (Javier, 19-oct-2026): what he puts on or takes at the same moment
 * goes together and is done with one tap, never with a photo: «agrupar cremas
 * de mañana, cremas de noche, para tocar una vez», and «la creatina antes de
 * entrenar». A product's `moment` is its routine; the routine is a daily
 * commitment with this title, ticked by hand. The training one is only owed on
 * the days he trains.
 */
export type RoutineMoment = Exclude<Moment, "mañana y noche">;

export const ROUTINE_TITLE: Record<RoutineMoment, string> = {
  mañana: "Rutina de mañana",
  noche: "Rutina de noche",
  entreno: "Antes de entrenar",
  // His supplement protocol (21-oct-2026: «de suplementación, no de estética»): the creams keep their own.
  ayunas: "En ayunas",
  "media mañana": "Media mañana",
};

/** The routines a product is in: the cleanser «mañana y noche» is in both. */
export const routinesOf = (moment: string | null): RoutineMoment[] =>
  moment === "mañana y noche" ? ["mañana", "noche"] : moment !== null && moment in ROUTINE_TITLE ? [moment as RoutineMoment] : [];

/** Its routine, to say: «Rutina de mañana», or both. */
export function routineTitle(moment: string | null): string | null {
  const titles = routinesOf(moment).map((m) => ROUTINE_TITLE[m]);
  return titles.length > 1 ? "Rutinas de mañana y de noche" : (titles[0] ?? null);
}

export const ROUTINES = Object.values(ROUTINE_TITLE);

export const isRoutine = (title: string): boolean => ROUTINES.includes(title);

/** A routine's product, for its row: the name in its detail, the icon in its stack. */
export interface Member {
  id: number;
  name: string;
  kind: string | null;
}

/**
 * The habit he had for one cream before routines: «Hyalu B5 Serum» for
 * «Hyalu B5 Serum Suractiv». A name that starts the other, never a short word.
 */
export function sameProduct(habit: string, product: string): boolean {
  const a = kindKey(habit);
  const b = kindKey(product);
  return Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a));
}
