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

/** A Spanish phone in a pending item ("900 200 008"), to call from the alert. */
export function phoneIn(text: string | null): string | null {
  const m = /\b([6789]\d{2})[ .]?(\d{3})[ .]?(\d{3})\b/.exec(text ?? "");
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}
