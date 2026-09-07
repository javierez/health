import { z } from "zod";

import { fixBrandNames } from "~/lib/transcript-brand-names";

/**
 * Client for Pocket's public API (heypocketai.com) — the recorder.
 *
 * 🚨 Pocket's docs do not document a single response field (every endpoint
 * publishes `data: null`). The shapes below come from probing the live API on
 * 2026-08-04, not from the manual. If Pocket changes something, the Zod schemas
 * fail here rather than halfway through the ingest, which is the point.
 *
 * Findings from that probe that shape the design:
 *   · Speakers arrive as `SPEAKER_00`, never named. Voice Print names live in
 *     their app and do not come out of the API.
 *   · There is no trace of a calendar event in the response.
 *   · `transcript` is clean; `raw_transcript` is word-by-word with the spacing
 *     destroyed ("A   ver   qué   tal"). We use the first.
 *   · `summarizations` is an OBJECT keyed by id, not a list.
 *   · Language arrives as ISO 639-3 ("spa"), not the "es" we store.
 *
 * Nothing throws: every function returns a result with `ok` and a readable
 * reason. A missing key, or Pocket being down, is a normal state of a periodic
 * sweep, not an exception.
 */

const BASE_URL = "https://public.heypocketai.com/api/v1";

/** Pocket always answers in this envelope; the useful part is in `data`. */
const envelopeSchema = z.object({
  success: z.boolean().optional(),
  error: z.string().nullish(),
  data: z.unknown().nullish(),
});

const recordingSummarySchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  duration: z.number().nullish(),
  state: z.string().nullish(),
  language: z.string().nullish(),
  recording_at: z.string().nullish(),
  created_at: z.string().nullish(),
  tags: z.array(z.unknown()).nullish(),
});

const segmentSchema = z.object({
  speaker: z.string().nullish(),
  text: z.string().nullish(),
  start: z.number().nullish(),
  end: z.number().nullish(),
});

const actionItemSchema = z.object({
  label: z.string().nullish(),
  context: z.string().nullish(),
  dueDate: z.string().nullish(),
  priority: z.string().nullish(),
  status: z.string().nullish(),
  type: z.string().nullish(),
});

const summarizationSchema = z.object({
  processingStatus: z.string().nullish(),
  updatedAt: z.string().nullish(),
  v2: z
    .object({
      summary: z.object({ markdown: z.string().nullish() }).nullish(),
      actionItems: z.object({ actions: z.array(actionItemSchema).nullish() }).nullish(),
    })
    .nullish(),
});

const recordingDetailSchema = recordingSummarySchema.extend({
  transcript: z
    .object({
      text: z.string().nullish(),
      segments: z.array(segmentSchema).nullish(),
    })
    .nullish(),
  // Keyed by summarizationId — hence the record instead of an array.
  summarizations: z.record(z.string(), summarizationSchema).nullish(),
});

const audioUrlSchema = z.object({
  signed_url: z.string(),
  expires_at: z.string().nullish(),
});

export interface PocketRecordingSummary {
  id: string;
  title: string | null;
  /** Seconds. */
  duration: number | null;
  /** When it was recorded (ISO). This is the good date, not `created_at`. */
  recordedAt: string | null;
  /** Already mapped to "es"/"en"; null if Pocket did not say. */
  language: string | null;
  /** Only `completed` carries a transcript. */
  state: string | null;
  tags: string[];
}

export interface PocketSpeakerTurn {
  /** `SPEAKER_00`. Anonymous by Pocket's design. */
  speaker: string;
  text: string;
  startSeconds: number | null;
}

export interface PocketRecordingDetail extends PocketRecordingSummary {
  /** The clean running text. This is what the classifier reads. */
  transcriptText: string | null;
  turns: PocketSpeakerTurn[];
  summaryMarkdown: string | null;
  actionItems: {
    label: string | null;
    context: string | null;
    dueDate: string | null;
    priority: string | null;
  }[];
  /** The untouched payload, stored verbatim on `recordings.raw`. */
  raw: unknown;
}

export interface PocketFailure {
  ok: false;
  /**
   * `no-key` and `unauthorized` need a new key; the rest are transient and the
   * sweep should just retry later.
   */
  reason:
    | "no-key"
    | "unauthorized"
    | "forbidden"
    | "not-found"
    | "rate-limited"
    | "unexpected-response"
    | "error";
  detail?: string;
}

export type PocketResult<T> = { ok: true; data: T } | PocketFailure;

/**
 * Pocket speaks ISO 639-3 ("spa"); we store ISO 639-1 ("es"). Only the
 * languages actually in use are mapped: anything else returns null rather than
 * inventing a code.
 */
const LANGUAGE_MAP: Record<string, string> = {
  spa: "es",
  es: "es",
  eng: "en",
  en: "en",
  por: "pt",
  pt: "pt",
  cat: "ca",
  ca: "ca",
};

export function mapPocketLanguage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return LANGUAGE_MAP[raw.toLowerCase()] ?? null;
}

function failureFromStatus(status: number, detail?: string): PocketFailure {
  if (status === 401) return { ok: false, reason: "unauthorized", detail };
  if (status === 403) return { ok: false, reason: "forbidden", detail };
  if (status === 404) return { ok: false, reason: "not-found", detail };
  if (status === 429) return { ok: false, reason: "rate-limited", detail };
  return { ok: false, reason: "error", detail: detail ?? `HTTP ${status}` };
}

/**
 * Pocket rate limits, and it does it sooner than you would think: reading the
 * detail of ~180 recordings back to back earned a 429 in under five minutes
 * (measured 2026-09-06, walking a 100-recording history twice).
 *
 * A sweep that gives up on the first 429 leaves half the history unfetched and
 * looks like it worked, so 429 is retried with a backoff instead of being
 * returned. Only 429: every other failure is returned to the caller untouched,
 * because retrying a 401 just means being wrong three times.
 */
const RETRY_DELAYS_MS = [1_000, 4_000, 15_000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request(
  apiKey: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  attempt = 0,
): Promise<PocketResult<unknown>> {
  if (!apiKey) return { ok: false, reason: "no-key" };

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      // The sweep runs in the background: better to give up than to hang.
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      detail: err instanceof Error ? err.message : "fetch failed",
    };
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      ok: false,
      reason: res.ok ? "unexpected-response" : "error",
      detail: text.slice(0, 200),
    };
  }

  const parsed = envelopeSchema.safeParse(json);
  if (!res.ok) {
    if (res.status === 429 && attempt < RETRY_DELAYS_MS.length) {
      // Honour Retry-After when Pocket sends one; it knows better than we do.
      const header = Number(res.headers.get("retry-after"));
      const waitMs =
        Number.isFinite(header) && header > 0
          ? Math.min(header * 1000, 60_000)
          : RETRY_DELAYS_MS[attempt]!;
      await sleep(waitMs);
      return request(apiKey, method, path, body, attempt + 1);
    }
    return failureFromStatus(
      res.status,
      parsed.success ? (parsed.data.error ?? undefined) : undefined,
    );
  }
  if (!parsed.success) {
    return { ok: false, reason: "unexpected-response", detail: "unknown envelope" };
  }
  return { ok: true, data: parsed.data.data };
}

function toSummary(raw: z.infer<typeof recordingSummarySchema>): PocketRecordingSummary {
  return {
    id: raw.id,
    // The title is Pocket's own, and it mishears the same names as the
    // transcript — "Revisión y formación de Besta" is a real one.
    title: fixBrandNames(raw.title ?? null),
    duration: raw.duration ?? null,
    recordedAt: raw.recording_at ?? raw.created_at ?? null,
    language: mapPocketLanguage(raw.language),
    state: raw.state ?? null,
    // Tags arrive without a fixed shape; keep only the string ones.
    tags: (raw.tags ?? []).filter((t): t is string => typeof t === "string"),
  };
}

/**
 * Recordings owned by the key, newest first. `since` filters on recording date
 * (`YYYY-MM-DD`, UTC per their docs), which is how the sweep avoids walking the
 * whole history every hour.
 */
export async function listPocketRecordings(
  apiKey: string,
  opts: { since?: string; limit?: number; page?: number } = {},
): Promise<PocketResult<PocketRecordingSummary[]>> {
  const params = new URLSearchParams();
  if (opts.since) params.set("start_date", opts.since);
  params.set("limit", String(Math.min(opts.limit ?? 50, 100)));
  if (opts.page) params.set("page", String(opts.page));

  const res = await request(apiKey, "GET", `/public/recordings?${params.toString()}`);
  if (!res.ok) return res;

  const parsed = z.array(recordingSummarySchema).safeParse(res.data ?? []);
  if (!parsed.success) {
    return { ok: false, reason: "unexpected-response", detail: "unreadable list" };
  }
  return { ok: true, data: parsed.data.map(toSummary) };
}

/**
 * One recording with its transcript and summary.
 *
 * From `summarizations` — keyed by id — we take the most recent COMPLETED one:
 * Pocket can have several in flight and the half-finished ones carry no text.
 */
export async function getPocketRecording(
  apiKey: string,
  recordingId: string,
): Promise<PocketResult<PocketRecordingDetail>> {
  const res = await request(
    apiKey,
    "GET",
    `/public/recordings/${encodeURIComponent(recordingId)}` +
      `?include_transcript=true&include_summarizations=true`,
  );
  if (!res.ok) return res;

  const parsed = recordingDetailSchema.safeParse(res.data);
  if (!parsed.success) {
    return { ok: false, reason: "unexpected-response", detail: "unreadable detail" };
  }
  const raw = parsed.data;

  const best = Object.values(raw.summarizations ?? {})
    .filter((s) => s.processingStatus === "completed")
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];

  const turns: PocketSpeakerTurn[] = (raw.transcript?.segments ?? [])
    .map((s) => ({
      speaker: s.speaker ?? "SPEAKER_??",
      text: (s.text ?? "").trim(),
      startSeconds: s.start ?? null,
    }))
    .filter((t) => t.text.length > 0);

  return {
    ok: true,
    data: {
      ...toSummary(raw),
      // Fixed here and not at the INSERT: the classifier, the list row and the
      // reading pane all sit below this function. Correcting only on write left
      // the model reading "Besta".
      transcriptText: fixBrandNames(raw.transcript?.text?.trim() ?? null),
      turns: turns.map((t) => ({ ...t, text: fixBrandNames(t.text) })),
      summaryMarkdown: fixBrandNames(best?.v2?.summary?.markdown?.trim() ?? null),
      actionItems: (best?.v2?.actionItems?.actions ?? []).map((a) => ({
        label: a.label ?? null,
        context: a.context ?? null,
        dueDate: a.dueDate ?? null,
        priority: a.priority ?? null,
      })),
      raw: res.data,
    },
  };
}

/**
 * Signed audio URL. It EXPIRES (60–86400s), so it is not worth storing: the
 * file has to be downloaded at the moment it is needed.
 */
export async function getPocketAudioUrl(
  apiKey: string,
  recordingId: string,
  expiresInSeconds = 900,
): Promise<PocketResult<{ url: string; expiresAt: string | null }>> {
  const res = await request(
    apiKey,
    "GET",
    `/public/recordings/${encodeURIComponent(recordingId)}/audio-url` +
      `?expires_in=${Math.min(Math.max(expiresInSeconds, 60), 86_400)}`,
  );
  if (!res.ok) return res;

  const parsed = audioUrlSchema.safeParse(res.data);
  if (!parsed.success) {
    return { ok: false, reason: "unexpected-response", detail: "unreadable url" };
  }
  return {
    ok: true,
    data: { url: parsed.data.signed_url, expiresAt: parsed.data.expires_at ?? null },
  };
}

/** Does this key work? Used before saving it, so it cannot fail silently. */
export async function verifyPocketKey(apiKey: string): Promise<PocketResult<true>> {
  const res = await listPocketRecordings(apiKey, { limit: 1 });
  return res.ok ? { ok: true, data: true } : res;
}

export function describePocketFailure(failure: PocketFailure): string {
  switch (failure.reason) {
    case "no-key":
      return "No Pocket API key configured.";
    case "unauthorized":
      return "The Pocket key is invalid or expired.";
    case "forbidden":
      return "This key is not allowed to do that.";
    case "not-found":
      return "That recording is no longer in Pocket.";
    case "rate-limited":
      return "Pocket is rate limiting us. Will retry later.";
    case "unexpected-response":
      return "Pocket answered something we do not recognise.";
    default:
      return "Could not reach Pocket.";
  }
}
