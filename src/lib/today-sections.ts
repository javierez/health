import { ROUTINE_TITLE } from "~/lib/routines";
import type { TodoRow } from "~/server/queries/today";

/** The four blocks of «Hoy». */
export type Section = "now" | "today" | "advice" | "auto";

export const SECTIONS: { key: Section; label: string | null }[] = [
  { key: "now", label: null },
  { key: "today", label: "Hoy" },
  { key: "advice", label: "Recomendado" },
  { key: "auto", label: "Se marca solo" },
];

/** What cannot wait on top, in amber; then his list; then the evidence; what the data ticks, small at the end. */
export function sectionOf(r: Pick<TodoRow, "urgent" | "done" | "source" | "tick">): Section {
  if (r.urgent && !r.done) return "now";
  if (r.source) return "advice";
  if (r.tick === null) return "auto";
  return "today";
}

/**
 * When in the day each routine is due, minutes from midnight. Bed is his
 * plan's; the rest, any time. «Antes de entrenar» has no hour: it shows once
 * he trained, and is asked then.
 */
const DUE: Record<string, number> = {
  [ROUTINE_TITLE.ayunas]: 8 * 60,
  [ROUTINE_TITLE.mañana]: 8 * 60 + 30,
  [ROUTINE_TITLE["media mañana"]]: 11 * 60,
  [ROUTINE_TITLE.noche]: 23 * 60,
};

/** His day runs 06:00 to 06:00: one in the morning is still tonight. */
const dayClock = (m: number) => (m < 360 ? m + 1440 : m);

/**
 * «Hoy» in the order of his day (Javier, 22-oct-2026: the five in sight follow
 * the hour): what cannot wait; what is due now, from an hour before to three
 * after; what goes any time; what comes later, by its hour; what he let pass.
 * Inside each, what he ticks before what the data ticks. A past day has no
 * now: only the last rule.
 */
export function byMoment<T extends Pick<TodoRow, "key" | "title" | "urgent" | "tick">>(rows: T[], now: number | null, bed: number): T[] {
  const place = (r: T): [number, number] => {
    const due = r.key === "bed" ? bed : DUE[r.title];
    if (r.urgent) return [0, 0];
    if (now === null || due === undefined) return [2, 0];
    const d = dayClock(due);
    const n = dayClock(now);
    return [d - 60 <= n && n <= d + 180 ? 1 : d > n ? 3 : 4, d];
  };
  const key = (r: T) => [...place(r), r.tick === null ? 1 : 0];
  return rows
    .map((r) => ({ r, k: key(r) }))
    .sort((a, b) => a.k[0]! - b.k[0]! || a.k[1]! - b.k[1]! || a.k[2]! - b.k[2]!)
    .map((x) => x.r);
}

/** What the counter counts: his own list, without the medical alert above and the advice below. */
export function listOf<T extends Pick<TodoRow, "key" | "source">>(rows: T[]): T[] {
  return rows.filter((r) => !r.key.startsWith("medical-") && !r.source);
}

/** A Spanish phone in a pending item ("900 200 008"), to call from the alert. */
export function phoneIn(text: string | null): string | null {
  const m = /\b([6789]\d{2})[ .]?(\d{3})[ .]?(\d{3})\b/.exec(text ?? "");
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}
