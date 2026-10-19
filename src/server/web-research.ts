import Anthropic from "@anthropic-ai/sdk";

import { env } from "~/env";
import { DEFAULT_MODEL } from "~/server/classify/episodes";

/**
 * One question to the web: the model searches, then fills one tool with what
 * it found. Used for a product's card and for what an exercise works.
 */
const SEARCH = { type: "web_search_20250305" as const, name: "web_search" as const, max_uses: 4 };
const ROUNDS = 4;

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

/** The tool's input. `system` and `tool` are the fixed part, cached; `ask` changes each time. */
export async function research(system: string, tool: Anthropic.Tool, ask: string): Promise<unknown> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: ask }];
  // Searching can pause a long turn; it goes on where it stopped. The last round forces the tool.
  for (let round = 0; round < ROUNDS; round++) {
    const last = round === ROUNDS - 1;
    const message = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 3_000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: last ? [{ ...tool, cache_control: { type: "ephemeral" } }] : [SEARCH, { ...tool, cache_control: { type: "ephemeral" } }],
      ...(last ? { tool_choice: { type: "tool" as const, name: tool.name } } : {}),
      messages,
    });
    const filled = message.content.find((c) => c.type === "tool_use" && c.name === tool.name);
    if (filled?.type === "tool_use") return filled.input;
    messages.push({ role: "assistant", content: message.content });
    if (message.stop_reason !== "pause_turn") messages.push({ role: "user", content: `Ahora llama a ${tool.name} con lo que has encontrado.` });
  }
  throw new Error(`sin ${tool.name} tras ${ROUNDS} rondas`);
}
