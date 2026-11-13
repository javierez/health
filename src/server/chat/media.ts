import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { env } from "~/env";

/**
 * What a WhatsApp attachment becomes before the model reads it.
 *
 * Meta hands out a media ID, not the file: one Graph call for a short-lived
 * URL, then the bytes, with the same bearer both times.
 */
const GRAPH = "https://graph.facebook.com/v21.0";

export async function downloadMedia(mediaId: string): Promise<{ bytes: Buffer; mime: string }> {
  const auth = { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` };
  const meta = (await (await fetch(`${GRAPH}/${mediaId}`, { headers: auth })).json()) as {
    url?: string;
    mime_type?: string;
  };
  if (!meta.url) throw new Error(`media ${mediaId}: no url`);
  const res = await fetch(meta.url, { headers: auth });
  if (!res.ok) throw new Error(`media ${mediaId}: ${res.status}`);
  return { bytes: Buffer.from(await res.arrayBuffer()), mime: meta.mime_type ?? "application/octet-stream" };
}

const run = promisify(execFile);

/**
 * At most this many frames, at most three a second. A fast curl is ~1,2 s a
 * rep: at two a second that is two frames, one top and one bottom if lucky,
 * and a rep slips through; three a second gives three or four. A set of 20 s
 * still fits in 60 frames, so the cost does not move (18-oct-2026). A
 * three-minute video drops to one every three seconds and the model reads the
 * exercise and the plates. 640 px on the long side keeps 60 frames near 18k
 * input tokens.
 */
export const MAX_FRAMES = 60;
const MAX_FPS = 3;

/** ffmpeg prints the length to stderr even when it is given nothing to do. */
export function parseDuration(stderr: string): number | null {
  const m = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export function frameRate(seconds: number | null): number {
  if (!seconds || seconds <= 0) return 1;
  return Math.min(MAX_FPS, MAX_FRAMES / seconds);
}

/** The video as JPEG frames, each with the second it was taken at. */
export async function videoFrames(bytes: Buffer): Promise<{ second: number; jpeg: Buffer }[]> {
  // Dynamic: the binary only enters the function that cuts videos.
  const { default: ffmpeg } = (await import("ffmpeg-static")) as unknown as { default: string | null };
  if (!ffmpeg) throw new Error("ffmpeg-static has no binary for this platform");

  const dir = await mkdtemp(join(tmpdir(), "salud-video-"));
  try {
    const input = join(dir, "in.mp4");
    await writeFile(input, bytes);
    const probe = await run(ffmpeg, ["-hide_banner", "-i", input]).catch((e: { stderr?: string }) => e);
    const fps = frameRate(parseDuration(String(probe.stderr ?? "")));

    await run(ffmpeg, [
      "-hide_banner",
      "-loglevel", "error",
      "-i", input,
      "-vf", `fps=${fps.toFixed(4)},scale='if(gt(iw,ih),640,-2)':'if(gt(iw,ih),-2,640)'`,
      "-frames:v", String(MAX_FRAMES),
      "-q:v", "5",
      join(dir, "f%03d.jpg"),
    ]);

    const names = (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort();
    return Promise.all(
      names.map(async (name, i) => ({
        second: Math.round((i / fps) * 10) / 10,
        jpeg: await readFile(join(dir, name)),
      })),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Frames per contact sheet: five across, four down. */
export const ACROSS = 5;
export const PER_SHEET = 20;

/**
 * The frames twenty to a picture, in order, left to right and top to bottom.
 * 384 px on the long side, five across: a phone video, upright, makes a sheet
 * of 1.096 × 1.556 px, inside the 1.568 the model reads without shrinking.
 * One sheet is ~2.200 tokens where its twenty frames one by one are ~6.000
 * (22-oct-2026).
 */
export async function contactSheets(frames: { second: number; jpeg: Buffer }[]): Promise<{ seconds: number[]; jpeg: Buffer }[]> {
  const { default: ffmpeg } = (await import("ffmpeg-static")) as unknown as { default: string | null };
  if (!ffmpeg) throw new Error("ffmpeg-static has no binary for this platform");
  const dir = await mkdtemp(join(tmpdir(), "salud-hoja-"));
  try {
    await Promise.all(frames.map((f, i) => writeFile(join(dir, `f${String(i + 1).padStart(3, "0")}.jpg`), f.jpeg)));
    await run(ffmpeg, [
      "-hide_banner",
      "-loglevel", "error",
      "-framerate", "1",
      "-i", join(dir, "f%03d.jpg"),
      "-vf", `scale='if(gt(iw,ih),384,-2)':'if(gt(iw,ih),-2,384)',tile=${ACROSS}x${PER_SHEET / ACROSS}:padding=4:color=white`,
      "-q:v", "4",
      join(dir, "s%02d.jpg"),
    ]);
    const names = (await readdir(dir)).filter((f) => f.startsWith("s")).sort();
    return Promise.all(
      names.map(async (name, i) => ({
        seconds: frames.slice(i * PER_SHEET, (i + 1) * PER_SHEET).map((f) => f.second),
        jpeg: await readFile(join(dir, name)),
      })),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** What the model reads as a picture. An iPhone photo sent as a file is HEIC: neither the model nor this ffmpeg opens it. */
export const READABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * A photo as a JPEG at most `max` px on its long side: 640 to keep it,
 * 1600 for one sent as a file, which can be 8 MB, past what the model takes.
 */
export async function shrink(bytes: Buffer, max: number): Promise<Buffer> {
  const { default: ffmpeg } = (await import("ffmpeg-static")) as unknown as { default: string | null };
  if (!ffmpeg) throw new Error("ffmpeg-static has no binary for this platform");
  const dir = await mkdtemp(join(tmpdir(), "salud-foto-"));
  try {
    const input = join(dir, "in");
    const output = join(dir, "out.jpg");
    await writeFile(input, bytes);
    await run(ffmpeg, [
      "-hide_banner",
      "-loglevel", "error",
      "-i", input,
      "-vf", `scale='if(gt(iw,ih),min(${max},iw),-2)':'if(gt(iw,ih),-2,min(${max},ih))'`,
      "-frames:v", "1",
      "-q:v", "4",
      output,
    ]);
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const EXT: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-m4a": "m4a" };

/**
 * A voice note as text: the model cannot hear. The extension has to match the
 * bytes (a Chrome recording is webm, Safari's is mp4, WhatsApp's is ogg).
 * Without `OPENAI_API_KEY` it is null and the chat asks him to write it.
 */
export async function transcribe(
  bytes: Buffer,
  mime: string,
  prompt = "Javier le habla a su asistente de salud: comidas, entrenos, sentadilla, press banca, WHOOP, Pocket, Vesta, compromisos.",
): Promise<string | null> {
  if (!env.OPENAI_API_KEY) return null;
  const type = mime.split(";")[0]!.trim();
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type }), `nota.${EXT[type] ?? "ogg"}`);
  form.append("model", "gpt-4o-transcribe");
  form.append("language", "es");
  form.append("prompt", prompt);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`transcribe ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { text?: string };
  return body.text?.trim() ?? null;
}

/** How the replies sound: one voice, the same everywhere. */
const VOICE = "ash";
const SPEAK_AS =
  "Español de España, de tú, como un amigo que entrena con él. Tono cercano y tranquilo, ritmo natural, sin sonar a locutor.";

/**
 * A reply read aloud, when he spoke. `opus` comes as Ogg/Opus, what WhatsApp
 * plays as a voice note; `mp3` is for the panel. About 1.5 cents a minute.
 */
export async function speak(text: string, format: "mp3" | "opus"): Promise<Buffer | null> {
  if (!env.OPENAI_API_KEY || text.trim().length === 0) return null;
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: VOICE, input: text.slice(0, 4_000), instructions: SPEAK_AS, response_format: format }),
  });
  if (!res.ok) throw new Error(`tts ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}
