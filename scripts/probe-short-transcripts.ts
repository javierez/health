/** What is actually inside the sub-200-character transcripts. Read-only. */
import { getPocketRecording, listPocketRecordings } from "~/server/pocket/client";

const KEY = process.env.POCKET_API_KEY ?? "";

async function main() {
  const list = await listPocketRecordings(KEY, { limit: 100 });
  if (!list.ok) {
    console.error(`✗ ${list.reason}`);
    process.exitCode = 1;
    return;
  }
  for (const s of list.data.filter((r) => r.state === "completed")) {
    const d = await getPocketRecording(KEY, s.id);
    if (!d.ok) continue;
    const t = d.data.transcriptText ?? "";
    if (t.length >= 200) continue;
    console.log(
      `${String(t.length).padStart(4)}c ${String(Math.round(d.data.duration ?? 0)).padStart(4)}s | ${JSON.stringify(t)}`,
    );
  }
}

await main();
