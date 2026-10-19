/**
 * No long or short dashes in what the model writes for a human to read: they
 * give it away as AI, and asking in the prompt is not enough because the model
 * copies them from the prompt itself. Ported from Vesta's `~/lib/ai/sin-rayas`.
 */
export function sinRayas(text: string): string {
  return text
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
    .replace(/^[ \t]*[–—][ \t]*/gm, "")
    .replace(/[ \t]*,?[ \t]*[–—][ \t]*([.,;:!?)]|$)/gm, "$1")
    .replace(/[ \t]*,?[ \t]*[–—]+[ \t]*/g, ", ");
}
