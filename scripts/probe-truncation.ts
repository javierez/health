/** Why do the longest recordings fail to parse? Read-only, one API call. */
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";

import { db } from "~/db";
import { recordings } from "~/db/schema";
import { buildRequest } from "~/server/classify/episodes";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const id = process.argv[2] ?? "336a3d26-8502-44e2-a110-7284c21fd8f8";

async function main() {
  const [row] = await db.select().from(recordings).where(eq(recordings.id, id)).limit(1);
  if (!row) throw new Error("not found");

  const req = buildRequest({
    title: row.title,
    turns: row.turns ?? [],
    transcript: row.transcript,
    summaryMarkdown: row.summaryMarkdown,
    durationSeconds: row.durationSeconds,
    recordedAt: row.recordedAt?.toISOString() ?? null,
  });
  if (!req) throw new Error("empty");

  const msg = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4096, // the value that failed
    system: req.system,
    tools: req.tools,
    tool_choice: { type: "tool", name: "record_episodes" },
    messages: req.messages,
  });

  console.log(`title       ${row.title}`);
  console.log(`duration    ${Math.round((row.durationSeconds ?? 0) / 60)} min`);
  console.log(`stop_reason ${msg.stop_reason}`);
  console.log(`usage       in ${msg.usage.input_tokens} / out ${msg.usage.output_tokens}`);

  const block = msg.content.find((c) => c.type === "tool_use");
  if (block && block.type === "tool_use") {
    const json = JSON.stringify(block.input);
    console.log(`tool input  ${json.length} chars`);
    console.log(json);
  }
}

await main();
