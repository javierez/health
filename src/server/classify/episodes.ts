import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { COUNTERPART_VALUES, KINDS, criteriaPrompt, kindsFor } from "~/lib/taxonomy";
import { MODEL_CATEGORIES, type ModelCategory } from "~/db/schema";
import { env } from "~/env";
import type { PocketSpeakerTurn } from "~/server/pocket/client";

/**
 * Splits one recording into EPISODES.
 *
 * 🚨 The thing this replaced asked for one category per recording, and that was
 * wrong in a way that quietly destroyed the data: a 40-minute recording is
 * routinely a client call, then the kids' school, then someone telling a story.
 * Filing it under `business` throws away two thirds of the day, and the day is
 * what we are reconstructing.
 *
 * The model is handed the transcript as TIMESTAMPED turns and asked where the
 * subject actually changes, so the boundaries are real offsets rather than a
 * share it estimated. That is what makes "3h12 of business, 40min of sport"
 * across a week mean something.
 *
 * Bump PROMPT_VERSION on any change here. Old rows keep their version and
 * `is_current = false`, so two passes can be diffed instead of one silently
 * overwriting the other.
 */
export const PROMPT_VERSION = "episodes-v5";
export const DEFAULT_MODEL = "claude-sonnet-5";

/**
 * Roughly 90k characters ≈ 30k tokens, comfortably inside every model we use.
 * The longest recording in the corpus is ~66k characters, so nothing is
 * actually truncated today — this is a guard, not a working limit.
 */
const MAX_TRANSCRIPT_CHARS = 90_000;

const SYSTEM_PROMPT = `You segment personal voice recordings captured on a wearable recorder.

The speaker is a founder who records his day: client and team calls, gym and
training sessions, doctor visits, meals and habits, family logistics, notes
dictated to his AI assistant, and thinking out loud.

Recordings may be in Spanish, English or Portuguese. ALWAYS write your output
fields in English regardless of the language spoken.

## Your job

One recording is usually NOT one thing. A single call often runs: business for
twenty minutes, then the kids' school, then five minutes of catching up. Split
the recording into consecutive EPISODES — stretches where the subject holds
steady — and label each one.

Every turn in the transcript is prefixed with its offset as [mm:ss]. Use those
to set each episode's start and end. Episodes must be in order, must not
overlap, and together should cover the whole recording.

## Categories

- business   — work: clients, team, product, sales, hiring, money, strategy.
               Also notes dictated to an AI assistant ABOUT work.
- health     — body and mind: doctors, symptoms, sleep, food, supplements, mood,
               weight, medication, recovery.
- sport      — training and physical activity: gym, running, cycling, matches,
               sessions, performance, technique, injuries while training.
- personal   — family, kids, school, friends, admin, travel, errands, plans.
               Life logistics that are not work, not the body, not training.
- social     — catching up, small talk, jokes, stories, greetings. Talking WITH
               someone rather than about a task.
- learning   — deliberately absorbing something: reading, courses, podcasts,
               someone teaching him, research he narrates.
- ambient    — the recorder was simply on while a TV, film, video or music
               played, with no conversation of his own. Background media, not
               something he did. Use this rather than "other" whenever the
               stretch is unattended playback.
- other      — genuinely unclassifiable.

## Rules

- Do NOT split every topic change. An episode is a stretch worth counting on a
  weekly total — roughly a minute or more. Two sentences about the weather in
  the middle of a client call belong to that call.
- Prefer FEWER, longer episodes. Aim for roughly one episode per 10-15 minutes
  of audio — a 40-minute recording is usually 1 to 4 episodes; a three-hour one
  might be 12. Fewer is better when the subject genuinely holds.
- COVER THE WHOLE RECORDING. Consecutive episodes must touch: each one starts
  where the last ended, from 0 to the total duration. If a stretch is just
  background media or silence, label it "ambient" rather than skipping it.
- A recording that really is one thing gets exactly one episode covering it all.
  That is the common case and it is correct.
- "one_liner" is ONE sentence under 100 characters saying what happened in THIS
  stretch — "Reviewed Q3 pricing with the Doblese team", not "A business call".
- "people" holds names actually spoken in that stretch. Speakers arrive
  anonymised as SPEAKER_00, so leave it empty rather than inventing names.
- "confidence" is your honest probability the category is right, 0 to 1.

## Calls

One recording often holds SEVERAL phone or video calls back to back: he hangs
up and dials the next one ("Oye Siri, llamar a…"), or someone calls back. Each
call is counted, so:

- A new call ALWAYS starts a new episode, even with the same person and the
  same subject. The goodbye belongs to the call it ends.
- "call" numbers the calls of the recording 1, 2, 3 in order. Every episode of
  the same call carries the same number, even when the subject changes
  mid-call (work, then the kids, then a joke: still one call).
- Leave "call" out when the stretch is not a call: in the same room as the
  people he talks to (a meeting, a visit, an office), alone, dictating, or
  media. A notification read aloud by an assistant is not a call. Nor is
  someone near him talking on their own phone.
- In a slice of a long recording, number from 1 within the slice; a call
  already under way when the slice starts is call 1.

## Criteria

After the category, every episode gets a "kind" and a "counterpart" from the
CLOSED lists below. These are what the weekly counts are built from, so a value
outside the list is worse than a slightly wrong one inside it.

"subcategory" stays free text: three or four words of DETAIL that the kind does
not already say — "phantom shares vesting", "knee rehab", "Lisbon trip". Never
repeat the kind there.

${criteriaPrompt()}`;

/**
 * 🚨 Lenient on the cosmetic fields, strict on the ones that get summed.
 *
 * Measured on the first full pass: 2 of 94 recordings were thrown away whole
 * because the model returned `topics` as `"vesting, cap table"` instead of an
 * array, or omitted `confidence`. Losing a 3-hour recording's entire day
 * because a tags field came back as a string is a bad trade — those fields
 * decorate the UI, they do not feed a total.
 *
 * `category`, `start_seconds` and `end_seconds` stay strict. Coercing those
 * would put invented minutes into a rollup, which is the one thing worth
 * failing over.
 */
const stringList = z
  .union([z.array(z.string()), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      return v
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    }
    return [];
  });

const episodeSchema = z.object({
  category: z.enum(MODEL_CATEGORIES),
  /**
   * Controlled vocabulary — see `~/lib/taxonomy`. Lenient here on purpose: an
   * off-list value is nulled by `normalise` rather than failing the recording,
   * because losing three hours over one bad enum is the trade that already bit
   * us twice.
   */
  kind: z.string().nullish(),
  counterpart: z.string().nullish(),
  subcategory: z.string().nullish(),
  confidence: z.coerce.number().min(0).max(1).catch(0.5).default(0.5),
  one_liner: z.string().nullish().default(""),
  /** Off-schema is "not a call", not a lost recording. */
  call: z.number().int().positive().nullish().catch(null),
  start_seconds: z.coerce.number().min(0),
  end_seconds: z.coerce.number().min(0),
  /**
   * 🚨 `.optional()` is load-bearing, not decoration. A `.transform()` chain is
   * a ZodEffects, and a ZodObject reports a MISSING key against one as
   * "Required" no matter how permissive the transform is. That is the exact
   * error that lost `6ba10b8e` (204 min) whole: the model simply omitted
   * `people` on one episode of eight, because there were no names to give.
   */
  topics: stringList.optional().transform((v) => v ?? []),
  people: stringList.optional().transform((v) => v ?? []),
});

const outputSchema = z.object({ episodes: z.array(episodeSchema).min(1) });

/** Exported so `normalise` can be tested without calling the model. */
export type RawEpisode = z.infer<typeof episodeSchema>;

/** The parse step on its own, so the lenient/strict split is testable. */
export function parseEpisodes(
  input: unknown,
): { ok: true; data: RawEpisode[] } | { ok: false; detail: string } {
  const parsed = outputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, detail: parsed.error.issues[0]?.message ?? "schema mismatch" };
  }
  return { ok: true, data: parsed.data.episodes };
}

export interface EpisodeOutput {
  category: ModelCategory;
  /** One of `kindsFor(category)`, or null when the model went off-list. */
  kind: string | null;
  counterpart: string | null;
  subcategory: string | null;
  confidence: number;
  oneLiner: string;
  /** Which call of the recording, numbered across slices. Null when not a call. */
  call: number | null;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  topics: string[];
  people: string[];
}

export interface ExtractionResult {
  episodes: EpisodeOutput[];
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
}

export type ExtractResult =
  | { ok: true; data: ExtractionResult }
  | { ok: false; reason: "empty" | "unexpected-response" | "error"; detail?: string };

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const TOOL: Anthropic.Tool = {
  name: "record_episodes",
  description: "Record the consecutive episodes that make up one recording.",
  input_schema: {
    type: "object",
    properties: {
      episodes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: { type: "string", enum: [...MODEL_CATEGORIES] },
            kind: {
              type: "string",
              enum: [...new Set(Object.values(KINDS).flat().map((t) => t.value))],
              description: "Must be one of the kinds listed for the chosen category.",
            },
            counterpart: {
              type: "string",
              enum: [...COUNTERPART_VALUES],
              description: "Who else was on the other side of this episode.",
            },
            subcategory: {
              type: "string",
              description: "Three or four words of detail the kind does not already say.",
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            one_liner: { type: "string" },
            call: {
              type: "integer",
              minimum: 1,
              description: "The phone or video call this stretch belongs to, 1, 2, 3 in order. Omit when it is not a call.",
            },
            start_seconds: { type: "number", description: "Offset where this episode starts." },
            end_seconds: { type: "number", description: "Offset where this episode ends." },
            topics: { type: "array", items: { type: "string" } },
            people: { type: "array", items: { type: "string" } },
          },
          required: ["category", "kind", "counterpart", "confidence", "one_liner", "start_seconds", "end_seconds"],
        },
      },
    },
    required: ["episodes"],
  },
};

function mmss(seconds: number | null): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The transcript as timestamped turns. Falls back to the flat text when Pocket
 * gave no segments — the model then has no offsets and returns one episode,
 * which is the honest answer rather than an invented split.
 */
export function renderTranscript(turns: PocketSpeakerTurn[], flat: string | null): string {
  if (turns.length === 0) return flat ?? "";
  return turns.map((t) => `[${mmss(t.startSeconds)}] ${t.speaker}: ${t.text}`).join("\n");
}

export interface ExtractInput {
  title: string | null;
  turns: PocketSpeakerTurn[];
  transcript: string | null;
  summaryMarkdown: string | null;
  durationSeconds: number | null;
  recordedAt: string | null;
}

/**
 * The exact request body, minus the model. Split out so `scripts/probe-cost.ts`
 * can price the real payload with `count_tokens` instead of guessing at it —
 * a cost estimate built from a reconstruction is an estimate of the wrong
 * thing.
 */
export function buildRequest(
  input: ExtractInput,
  window?: Window,
): {
  system: string;
  tools: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
} | null {
  const turns = window
    ? input.turns.filter(
        (t) => (t.startSeconds ?? 0) >= window.start && (t.startSeconds ?? 0) < window.end,
      )
    : input.turns;
  const body = renderTranscript(turns, window ? null : input.transcript);
  if (body.trim().length === 0) return null;

  const total = input.durationSeconds ?? 0;
  const parts = [
    input.title ? `Title: ${input.title}` : null,
    input.recordedAt ? `Recorded at: ${input.recordedAt}` : null,
    total ? `Total duration: ${Math.round(total)} seconds (${mmss(total)})` : null,
    window
      ? `\nThis is SLICE ${window.index + 1} of ${window.count} of a long recording. ` +
        `Cover ONLY ${mmss(window.start)} to ${mmss(window.end)} (${Math.round(window.start)}` +
        `–${Math.round(window.end)} seconds). The [mm:ss] prefixes are absolute offsets ` +
        `into the whole recording — report start_seconds and end_seconds on that same ` +
        `absolute scale, not relative to this slice. Your episodes must together span ` +
        `the whole slice and nothing outside it.`
      : null,
    `\nTranscript:\n${body.slice(0, MAX_TRANSCRIPT_CHARS)}` +
      (body.length > MAX_TRANSCRIPT_CHARS ? "\n[…truncated]" : ""),
  ].filter((p): p is string => p !== null);

  return {
    system: SYSTEM_PROMPT,
    tools: [TOOL],
    messages: [{ role: "user", content: parts.join("\n") }],
  };
}

export interface Window {
  start: number;
  end: number;
  index: number;
  count: number;
}

/**
 * 🚨 One call per recording does not scale past about an hour, and it fails
 * SILENTLY — the model does not error, it just stops describing.
 *
 * Measured on the v2 pass, share of each long recording that `normalise` had to
 * invent as "unattributed" filler because the model quit early:
 *
 *   300 min → 88 % filler (4 episodes for five hours)
 *    73 min → 83 %
 *   162 min → 10 %
 *
 * That is ~5.5 hours of the corpus described by nobody. The same failure at its
 * extreme is what killed `336a3d26` outright: asked for 152 minutes it covered
 * 33, then padded the tool call with literal `"placeholder2"` episodes.
 *
 * So anything longer than one window is cut into slices and asked for one at a
 * time. Offsets stay absolute, so the slices concatenate without arithmetic.
 */
const WINDOW_SECONDS = 2_700;

export function planWindows(input: ExtractInput): Window[] {
  const last = input.turns.reduce((m, t) => Math.max(m, t.startSeconds ?? 0), 0);
  const span = Math.max(last, input.durationSeconds ?? 0);
  if (input.turns.length === 0 || span <= WINDOW_SECONDS) return [];

  const count = Math.ceil(span / WINDOW_SECONDS);
  const size = span / count; // even slices beat a ragged last one
  return Array.from({ length: count }, (_, index) => ({
    start: index * size,
    end: index === count - 1 ? span + 1 : (index + 1) * size,
    index,
    count,
  }));
}

async function callOnce(
  req: NonNullable<ReturnType<typeof buildRequest>>,
  model: string,
): Promise<
  | { ok: true; episodes: RawEpisode[]; inputTokens: number; outputTokens: number }
  | { ok: false; reason: "unexpected-response" | "error"; detail: string }
> {
  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model,
      max_tokens: 8_192,
      system: req.system,
      tools: req.tools,
      tool_choice: { type: "tool", name: TOOL.name },
      messages: req.messages,
    });
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      detail: err instanceof Error ? err.message : "Anthropic call failed",
    };
  }

  /**
   * A truncated tool call parses as a confusing Zod error rather than as what
   * it is. Name it, so the next person does not spend an hour on the wrong
   * hypothesis the way this one did.
   */
  if (message.stop_reason === "max_tokens") {
    return { ok: false, reason: "unexpected-response", detail: "truncated at max_tokens" };
  }

  const block = message.content.find((c) => c.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    return { ok: false, reason: "unexpected-response", detail: "no tool_use block" };
  }

  const parsed = parseEpisodes(block.input);
  if (!parsed.ok) {
    return { ok: false, reason: "unexpected-response", detail: parsed.detail };
  }

  return {
    ok: true,
    episodes: parsed.data,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}

export async function extractEpisodes(
  input: ExtractInput,
  opts: { model?: string } = {},
): Promise<ExtractResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const total = input.durationSeconds ?? 0;

  const windows = planWindows(input);
  const requests =
    windows.length === 0
      ? [buildRequest(input)]
      : windows.map((w) => buildRequest(input, w));

  const usable = requests.filter((r): r is NonNullable<typeof r> => r !== null);
  if (usable.length === 0) return { ok: false, reason: "empty" };

  const slices: RawEpisode[][] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (const req of usable) {
    const res = await callOnce(req, model);
    /**
     * One bad slice must not cost the other four. A slice that comes back
     * unparseable leaves its stretch to `normalise`, which fills it as
     * unattributed — the same hole as before, but bounded to 45 minutes
     * instead of the whole recording.
     */
    if (!res.ok) {
      if (usable.length === 1) return res;
      slices.push([]); // a hole: no call runs across it
      continue;
    }
    slices.push(res.episodes);
    inputTokens += res.inputTokens;
    outputTokens += res.outputTokens;
  }

  const raw = joinCalls(slices);
  if (raw.length === 0) {
    return { ok: false, reason: "unexpected-response", detail: "no slice parsed" };
  }

  return {
    ok: true,
    data: {
      episodes: normalise(raw, total),
      model,
      promptVersion: PROMPT_VERSION,
      inputTokens,
      outputTokens,
    },
  };
}

/**
 * Each slice of a long recording numbers its calls from 1. Renumbered for the
 * whole recording: when the last stretch of one slice and the first of the
 * next are both calls, the cut fell mid-call and it is the same call; any
 * other call is the next number.
 */
export function joinCalls(slices: RawEpisode[][]): RawEpisode[] {
  const out: RawEpisode[] = [];
  let next = 0;
  let tail: number | null | undefined; // the call the previous slice ended in
  for (const slice of slices) {
    const sorted = [...slice].sort((a, b) => a.start_seconds - b.start_seconds);
    const ids = new Map<number, number>();
    if (tail != null && sorted[0]?.call != null) ids.set(sorted[0].call, tail);
    const joined = sorted.map((e) => {
      if (e.call == null) return e;
      if (!ids.has(e.call)) ids.set(e.call, ++next);
      return { ...e, call: ids.get(e.call) };
    });
    out.push(...joined);
    tail = joined.at(-1)?.call;
  }
  return out;
}

/**
 * 🚨 Model-reported boundaries are not trustworthy enough to sum.
 *
 * Measured over the first full pass on the real corpus (38 recordings with LLM
 * episodes): 0 overlaps and 0 over-runs after clamping — but **34 gaps holding
 * 251 minutes**, the largest a single 32-minute hole. Those minutes existed in
 * the audio and appeared in no total. A day view that silently loses four hours
 * is worse than no day view.
 *
 * So boundaries are clamped, sorted, de-overlapped, gap-filled and stretched to
 * cover the recording before anything is stored.
 */

/**
 * Under a minute, a gap is the model rounding between turns — the subject had
 * not changed, so the time belongs to the episode before it. Over a minute it
 * is a stretch the model declined to describe, and crediting 32 minutes of
 * unknown to "business" would inflate exactly the number we care about most.
 */
const GAP_MERGE_SECONDS = 60;

export function normalise(
  raw: RawEpisode[],
  totalSeconds: number,
): EpisodeOutput[] {
  const cap = totalSeconds > 0 ? Math.round(totalSeconds) : Infinity;

  const sorted = [...raw].sort((a, b) => a.start_seconds - b.start_seconds);
  const out: EpisodeOutput[] = [];

  for (const e of sorted) {
    const prev = out[out.length - 1];
    // An episode may not start before the previous one ended.
    const start = Math.min(Math.max(0, Math.round(e.start_seconds), prev?.endSeconds ?? 0), cap);
    const end = Math.min(Math.max(Math.round(e.end_seconds), start), cap);
    if (end <= start && out.length > 0) continue; // fully swallowed, drop it

    if (prev && start > prev.endSeconds) {
      const gap = start - prev.endSeconds;
      if (gap <= GAP_MERGE_SECONDS) {
        prev.endSeconds = start;
        prev.durationSeconds = start - prev.startSeconds;
      } else {
        out.push(unattributed(prev.endSeconds, start));
      }
    }

    out.push({
      category: e.category,
      // An off-list kind is dropped, not kept: a value nothing can group by is
      // exactly the free-text problem the taxonomy exists to end.
      kind: kindsFor(e.category).includes(e.kind ?? "") ? (e.kind ?? null) : null,
      counterpart: COUNTERPART_VALUES.includes(e.counterpart ?? "")
        ? (e.counterpart ?? null)
        : null,
      subcategory: e.subcategory?.trim() ?? null,
      confidence: e.confidence,
      oneLiner: (e.one_liner ?? "").trim(),
      call: e.call ?? null,
      startSeconds: start,
      endSeconds: end,
      durationSeconds: end - start,
      topics: e.topics,
      people: e.people,
    });
  }

  // Stretch the last one to the end: the minutes exist whether or not the model
  // mentioned them, and dropping them makes every rollup undercount.
  const last = out[out.length - 1];
  if (last && cap !== Infinity && last.endSeconds < cap) {
    const tail = cap - last.endSeconds;
    if (tail <= GAP_MERGE_SECONDS) {
      last.endSeconds = cap;
      last.durationSeconds = cap - last.startSeconds;
    } else {
      out.push(unattributed(last.endSeconds, cap));
    }
  }

  // `seq` is assigned at insert time, from this array's order.
  return out;
}

/**
 * The filler for a stretch the model skipped. `ambient` because it is excluded
 * from every rollup total: the honest claim is "we cannot account for this
 * time", not "this was work".
 */
function unattributed(start: number, end: number): EpisodeOutput {
  return {
    category: "ambient",
    kind: "silence",
    counterpart: "media",
    subcategory: "unattributed",
    confidence: 0,
    oneLiner: "Not described by the model — silence, background, or a skipped stretch.",
    call: null,
    startSeconds: start,
    endSeconds: end,
    durationSeconds: end - start,
    topics: [],
    people: [],
  };
}
