import type { WaTone, WaTopic } from "~/db/schema";
import { addDays } from "~/lib/day";

/**
 * «Conversaciones» (Javier, 18-oct-2026): his WhatsApp chats and the
 * conversations the Pocket heard, on the same two lists (tone and topic), so
 * they add up. Pure: the rows come from `~/server/queries/conversations`.
 */
export interface Talk {
  day: string;
  source: "whatsapp" | "pocket";
  /** A WhatsApp contact's name, or who a Pocket stretch was with («Cliente»). */
  who: string;
  tone: WaTone;
  topic: WaTopic | null;
}

export interface Person {
  who: string;
  talks: number;
  tense: number;
}

/** What he can act on: which topics come tense, and with whom. Not the past day by day. */
export interface Conversations {
  topics: { topic: WaTopic; talks: number; tense: number }[];
  people: Person[];
  total: number;
}

const WEEKS = 8;
/** Under this many with one person, a share is one bad afternoon. */
export const MIN_PERSON = 3;
const PEOPLE = 6;

export const isTense = (t: WaTone) => t === "tensa" || t === "mala";

/** The Monday of a day. */
export function weekOf(day: string): string {
  const dow = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

export function summarizeTalks(talks: Talk[], today: string): Conversations {
  const first = addDays(weekOf(today), -(WEEKS - 1) * 7);
  const recent = talks.filter((t) => t.day >= first && t.day <= today);

  const byTopic = new Map<WaTopic, { talks: number; tense: number }>();
  for (const t of recent) {
    if (!t.topic) continue;
    const s = byTopic.get(t.topic) ?? { talks: 0, tense: 0 };
    byTopic.set(t.topic, { talks: s.talks + 1, tense: s.tense + (isTense(t.tone) ? 1 : 0) });
  }

  // People: WhatsApp names only; a Pocket stretch says «Cliente», not who.
  const byPerson = new Map<string, Person>();
  // A bare number is a contact WhatsApp never named: nothing he can read.
  for (const t of recent.filter((t) => t.source === "whatsapp" && !/^\+?\d+$/.test(t.who))) {
    const p = byPerson.get(t.who) ?? { who: t.who, talks: 0, tense: 0 };
    p.talks += 1;
    if (isTense(t.tone)) p.tense += 1;
    byPerson.set(t.who, p);
  }

  return {
    topics: [...byTopic]
      .map(([topic, s]) => ({ topic, ...s }))
      .sort((a, b) => b.talks - a.talks),
    people: [...byPerson.values()]
      .filter((p) => p.talks >= MIN_PERSON && p.tense > 0)
      .sort((a, b) => b.tense / b.talks - a.tense / a.talks || b.talks - a.talks)
      .slice(0, PEOPLE),
    total: recent.length,
  };
}
