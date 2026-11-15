/**
 * The voice notes and photos of the chats he follows (`WHATSAPP_FOLLOW`) from
 * a folder of files named `<WhatsApp id>.<ext>`, for the ones WhatsApp
 * already dropped. Vesta keeps a copy of every file of his line;
 * `~/Desktop/vesta/tmp/whatsapp-amaya-a-salud.mjs` brings a chat's to a folder
 * (and the messages Pulso never had). The days are not read again: what the
 * notes and photos say is in the agent's search as is, and the days that got
 * new messages are what `scripts/read-whatsapp.ts` reads if ever wanted.
 *
 *   set -a && source .env.local && set +a && pnpm tsx scripts/whatsapp-media.ts --dir <folder>           # dry: what and cost
 *   … scripts/whatsapp-media.ts --dir <folder> --write
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";

import { followedChats, hearAndSee, unheardUnseen } from "~/server/evolution/sync";

const MIME: Record<string, string> = {
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".oga": "audio/ogg",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
};

const write = process.argv.includes("--write");
const at = process.argv.indexOf("--dir");
const dir = at > 0 ? process.argv[at + 1] : undefined;
if (!dir) throw new Error("--dir <folder>");
if (followedChats().length === 0) throw new Error("WHATSAPP_FOLLOW is empty: no chat is followed");

const files = new Map<string, { name: string; size: number }>();
for (const name of await readdir(dir)) {
  const ext = extname(name).toLowerCase();
  if (MIME[ext]) files.set(name.slice(0, -ext.length), { name, size: (await stat(join(dir, name))).size });
}
const rows = await unheardUnseen({ since: "", limit: 100_000, ids: [...files.keys()] });
const notes = rows.filter((r) => r.type === "audioMessage");
// Vesta's copy of a voice note weighs ~16 KB a second, eight times WhatsApp's (188 notes, 68 min, 14-nov-2026).
const minutes = notes.reduce((s, r) => s + (files.get(r.id)?.size ?? 0), 0) / 16_000 / 60;

// gpt-4o-transcribe ~$0.006 a minute; Sonnet 5 at $2 in / $10 out per million, a photo ~1.600 in and 80 out.
const usd = minutes * 0.006 + ((rows.length - notes.length) * (1_600 * 2 + 80 * 10)) / 1e6;
console.log(
  `${files.size} files: ${notes.length} voice notes (~${Math.round(minutes)} min) and ${rows.length - notes.length} photos to read, ` +
    `about $${usd.toFixed(2)}`,
);

if (write && rows.length > 0) {
  const errors: string[] = [];
  const local = async (id: string) => {
    const f = files.get(id)!;
    const bytes = await readFile(join(dir, f.name));
    // Vesta keeps a voice note as AAC in MP4 under the name «.oga»: what it is, from its bytes.
    const mp4 = bytes.subarray(4, 8).toString("latin1") === "ftyp";
    return { bytes, mime: mp4 ? "audio/mp4" : MIME[extname(f.name).toLowerCase()]! };
  };
  let heard = 0;
  let seen = 0;
  for (let i = 0; i < rows.length; i += 40) {
    const r = await hearAndSee(rows.slice(i, i + 40), errors, local);
    heard += r.heard;
    seen += r.seen;
    console.log(`${Math.min(i + 40, rows.length)}/${rows.length} · ${heard} notes heard, ${seen} photos seen`);
  }
  for (const e of errors) console.error(`  ${e}`);
}
process.exit(0);
