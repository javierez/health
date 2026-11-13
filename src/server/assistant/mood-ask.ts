import type { MessageKind } from "./plan";

/**
 * His mood, asked more than once a day (Javier, 19-oct-2026: «de ánimo,
 * ¿puede ser varias veces al día?»). It rides on the morning note and the
 * afternoon nudge, never a message of its own, and only when he has not
 * told one in the last three hours. The bedtime alert already asks (`write.ts`).
 * In code, not in the prompt: the model would drop it some days.
 */
export const MOOD_QUESTION = "¿Ánimo ahora, del 1 al 10?";
const ASKED_IN: MessageKind[] = ["morning", "commitments"];
const FRESH_MS = 3 * 3_600_000;
/** What a template variable takes (`parseWritten`). */
const MAX = 700;

export function withMoodAsk(text: string, kind: MessageKind, lastMood: Date | null, now: Date): string {
  if (!ASKED_IN.includes(kind)) return text;
  if (lastMood && now.getTime() - lastMood.getTime() < FRESH_MS) return text;
  // Under a note with its list, the question goes on a line of its own.
  return `${text.slice(0, MAX - MOOD_QUESTION.length - 1).trim()}${text.includes("\n") ? "\n" : " "}${MOOD_QUESTION}`;
}
