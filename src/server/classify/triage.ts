/**
 * The cheap pass that runs before Claude sees anything.
 *
 * 🚨 A third of the corpus is not a recording. Measured over the 86 completed
 * recordings in the account on 2026-09-06:
 *
 *   < 50 chars    26      "Meta" · a hang-up · silence · "Queda claro, ok"
 *   50–200 chars   5
 *   200–400        0      ← nothing lives here
 *   400–1000       3
 *   > 1000        52
 *
 * The gap at 200–400 is real, not a rounding artefact: a Pocket recording is
 * either a misfire of a few seconds or an actual conversation, with almost
 * nothing in between. So the split is deterministic and costs nothing, instead
 * of paying Sonnet to read the word "Meta" and answer `other` at 95%.
 *
 * The first classification pass put 8 of 14 recordings in `other`, and reading
 * them showed they were misfires, not mistakes. Without this filter the `other`
 * tab swallows the app.
 */

/** Below this a transcript has never been a real conversation in the corpus. */
const MIN_TRANSCRIPT_CHARS = 200;

/**
 * A long recording that transcribed to almost nothing is a DIFFERENT animal
 * from a two-second misfire: the audio is there and the words are not. One
 * example in the corpus — 619 seconds of audio, 40 characters of transcript.
 * Worth surfacing rather than silently binning, because it is the shape a
 * broken microphone would make.
 */
const FAILED_TRANSCRIPTION_SECONDS = 120;

export type TriageVerdict =
  | { kind: "classify" }
  | { kind: "noise"; note: string }
  | { kind: "failed-transcription"; note: string };

export function triage(input: {
  transcript: string | null;
  summaryMarkdown: string | null;
  durationSeconds: number | null;
}): TriageVerdict {
  const chars = input.transcript?.trim().length ?? 0;
  const seconds = input.durationSeconds ?? 0;

  if (chars >= MIN_TRANSCRIPT_CHARS) return { kind: "classify" };

  if (seconds >= FAILED_TRANSCRIPTION_SECONDS) {
    return {
      kind: "failed-transcription",
      note: `${Math.round(seconds)}s of audio produced only ${chars} characters`,
    };
  }

  return {
    kind: "noise",
    note:
      chars === 0
        ? "No transcript — silence or a misfire"
        : `Too short to classify (${chars} characters, ${Math.round(seconds)}s)`,
  };
}
