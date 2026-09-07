/**
 * The proper nouns the transcriber mishears, and only those.
 *
 * Pocket transcribes on its side, so there is no prompt of ours to feed the
 * vocabulary into: it arrives already written, and always wrong the same way.
 * Measured over the 66 August 2026 recordings in Vesta's corpus:
 *
 *   Besta       55 times across 17 recordings   → Vesta
 *   Inmobilia   11 times across  3 recordings   → Inmovilla
 *   Inmobilla   10 times across  6 recordings   → Inmovilla
 *   Bestafone    1 time                         → Vesta phone
 *
 * It matters here because the classifier reads this text. "Revisión y formación
 * de Besta" is a business recording about our own product, and the model should
 * not have to guess that.
 *
 * 🚨 **Only words that do not exist in Spanish, and with `\b` on both sides.**
 * Both rules come from a predecessor that substituted without word boundaries
 * and turned "dormitorios" into "habitacionesitaciones".
 *
 * That is why **Lystos is not here**: the transcriber writes it "Listos", which
 * IS a Spanish word. Telling the company from the adjective needs context, so
 * that is the model's job, not this file's.
 *
 * Ported from Vesta's `src/lib/transcript-brand-names.ts`. The two copies do
 * not know about each other — a name added there has to be added here too.
 */

/** Misheard → correct. Keys are compared case-insensitively. */
const BRAND_NAMES: Record<string, string> = {
  besta: "Vesta",
  bestafone: "Vesta phone",
  inmobilla: "Inmovilla",
  inmobilia: "Inmovilla",
  besthouse: "Best House",
  besthause: "Best House",
  bestouse: "Best House",
  bestous: "Best House",
  vesthouse: "Best House",
  vesthost: "Best House",
  // "besthos" is deliberately OUT: its only appearance is inside
  // "leon@besthos.com". See the address rule below.
};

/**
 * One alternation with `\b` on both sides, built once — these are transcripts
 * of up to 66,000 characters and this runs on every one.
 *
 * Longer keys first so "bestafone" beats "besta"; the other way round would
 * leave "Vestafone".
 */
const PATTERN = new RegExp(
  `\\b(${Object.keys(BRAND_NAMES)
    .sort((a, b) => b.length - a.length)
    .join("|")})\\b`,
  "gi",
);

/**
 * 🚨 An email or a domain does not get corrected, it gets broken.
 *
 * Substituting inside "leon@besthos.com" leaves "leon@Best House.com", which is
 * no longer an address. Looking at the character glued to either side is
 * enough: a brand said out loud sits between spaces or punctuation, never
 * against an `@` or a dot followed by letters.
 */
function insideAnAddress(full: string, offset: number, length: number): boolean {
  const before = full[offset - 1];
  if (before === "@" || before === "." || before === "/") return true;
  const after = full.slice(offset + length, offset + length + 5);
  return after.startsWith("@") || /^\.[a-z]{2}/i.test(after);
}

/** The same text with the proper nouns spelled right. */
export function fixBrandNames<T extends string | null | undefined>(text: T): T {
  if (!text) return text;
  return text.replace(PATTERN, (match: string, _g: string, offset: number, full: string) => {
    if (insideAnAddress(full, offset, match.length)) return match;
    return BRAND_NAMES[match.toLowerCase()] ?? match;
  }) as T;
}
