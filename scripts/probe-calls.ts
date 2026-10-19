/**
 * Does episodes-v5 find the calls? Four recordings whose calls were counted by
 * hand, reading the transcript. Re-splits them with the model and compares.
 * Writes nothing: the stored episodes are untouched.
 *
 * Paid: four recordings, about three hours of audio, a few cents of Sonnet.
 *
 *   set -a && source .env.local && set +a && pnpm tsx scripts/probe-calls.ts
 */
import { eq } from "drizzle-orm";

import { db } from "~/db";
import { recordings } from "~/db/schema";
import { extractEpisodes, PROMPT_VERSION } from "~/server/classify/episodes";

interface Expected {
  /** Where the call starts, in seconds. Matched within MARGIN. */
  at: number;
  work: boolean;
  who: string;
}

/** Hand count. `exact`: nothing else in the recording is a call. */
const CASES: { id: string; exact: boolean; calls: Expected[] }[] = [
  {
    // The tail of a call, "Oye Siri, llamar a Adrián Best House", the long
    // call; then his mother in person, a Vesta alert read aloud, a podcast.
    id: "cba2be23-d493-45d2-b485-92864ef136fa",
    exact: true,
    calls: [
      { at: 0, work: true, who: "end of a call (Adrián)" },
      { at: 117, work: true, who: "Adrián, Best House" },
    ],
  },
  {
    // Guille, "te llamo ahora de vuelta", hangs up; Carmen/Ana by phone; then
    // in person at their office (Ana on her own phone with a buyer: not his).
    id: "dfff9456-e76a-4fa9-9390-ac40839ca026",
    exact: true,
    calls: [
      { at: 0, work: true, who: "Guille" },
      { at: 390, work: true, who: "Carmen / Ana" },
    ],
  },
  {
    // Gonzalo, goodbye; "Oye Siri, llamar a Manu" the tailor. The rest is
    // TV and home, not checked by hand.
    id: "2e4941bb-fe61-4d9e-bbd3-d16fa4c1fc58",
    exact: false,
    calls: [
      { at: 0, work: true, who: "Gonzalo" },
      { at: 755, work: false, who: "Manu, the tailor" },
    ],
  },
  {
    id: "19264e4d-5f6e-45dd-972a-8e0147aa9bc1",
    exact: true,
    calls: [{ at: 0, work: true, who: "a Vesta client, CRM questions" }],
  },
];

const MARGIN = 90;
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.round(s) % 60).padStart(2, "0")}`;

let right = 0;
let wrong = 0;
let tokensIn = 0;
let tokensOut = 0;

for (const c of CASES) {
  const [row] = await db.select().from(recordings).where(eq(recordings.id, c.id));
  if (!row) {
    console.log(`✗ ${c.id.slice(0, 8)} not in this database`);
    wrong += 1;
    continue;
  }
  const res = await extractEpisodes({
    title: row.title,
    turns: row.turns ?? [],
    transcript: row.transcript,
    summaryMarkdown: row.summaryMarkdown,
    durationSeconds: row.durationSeconds,
    recordedAt: row.recordedAt?.toISOString() ?? null,
  });
  if (!res.ok) {
    console.log(`✗ ${c.id.slice(0, 8)} ${res.reason} ${res.detail ?? ""}`);
    wrong += 1;
    continue;
  }
  tokensIn += res.data.inputTokens;
  tokensOut += res.data.outputTokens;

  const found = new Map<number, { start: number; end: number; work: boolean; line: string }>();
  for (const e of res.data.episodes) {
    if (e.call === null) continue;
    const f = found.get(e.call) ?? { start: e.startSeconds, end: e.endSeconds, work: false, line: e.oneLiner };
    f.end = Math.max(f.end, e.endSeconds);
    if (e.category === "business") f.work = true;
    found.set(e.call, f);
  }
  const calls = [...found.values()];

  console.log(`\n${c.id.slice(0, 8)} ${row.title ?? ""}: ${calls.length} calls found, ${c.calls.length} by hand`);
  for (const f of calls) console.log(`  ${mmss(f.start)}–${mmss(f.end)} ${f.work ? "work" : "    "} ${f.line}`);

  const misses = c.calls.filter((x) => !calls.some((f) => Math.abs(f.start - x.at) <= MARGIN && f.work === x.work));
  for (const m of misses) console.log(`  ✗ missed ${mmss(m.at)} ${m.work ? "work" : "personal"} call: ${m.who}`);
  const extra = c.exact && calls.length !== c.calls.length;
  if (extra) console.log(`  ✗ ${calls.length} calls, the hand count is ${c.calls.length}`);
  if (misses.length === 0 && !extra) right += 1;
  else wrong += 1;
}

// Sonnet 5: $2 in, $10 out per million.
const cost = (tokensIn / 1e6) * 2 + (tokensOut / 1e6) * 10;
console.log(`\n${PROMPT_VERSION}: ${right}/${CASES.length} recordings right · $${cost.toFixed(2)}`);
process.exit(wrong > 0 ? 1 : 0);
