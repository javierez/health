/**
 * A reply as he would get it from a friend on WhatsApp: short, one message
 * when one is enough (Javier, 17-oct-2026: too much text). The model
 * separates them with a blank line; this cuts there, and cuts a long block
 * that came without any by sentences, so a wall of text never goes out as
 * one bubble.
 */
export const MAX_BUBBLES = 3;
const LONG = 220;
const TARGET = 160;

export function toBubbles(reply: string): string[] {
  const parts = reply
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (p.length > LONG ? bySentence(p) : [p]));
  if (parts.length <= MAX_BUBBLES) return parts;
  // Past the third, the rest goes in the last one: four pings in a row is spam.
  return [...parts.slice(0, MAX_BUBBLES - 1), parts.slice(MAX_BUBBLES - 1).join(" ")];
}

/** Whole sentences, packed up to ~160 characters. A question always ends a bubble. */
function bySentence(text: string): string[] {
  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  const out: string[] = [];
  for (const s of sentences) {
    const last = out.at(-1);
    if (last && !last.endsWith("?") && last.length + s.length + 1 <= TARGET) out[out.length - 1] = `${last} ${s}`;
    else out.push(s);
  }
  return out;
}

/** How long "escribiendo…" shows before the next bubble: longer for a longer one, never a wait. */
export function typingMs(text: string): number {
  return Math.min(1_600, 500 + text.length * 12);
}
