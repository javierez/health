import Anthropic from "@anthropic-ai/sdk";

import { env } from "~/env";
import { sinRayas } from "~/lib/sin-rayas";
import { DEFAULT_MODEL } from "~/server/classify/episodes";
import { blocks, type Part } from "./parts";
import { SYSTEM } from "./prompt";
import { runTool, TOOLS, type TurnState } from "./tools";

/**
 * One message, worked through: the model calls the tools it needs (several
 * at once, or one after another when it needs a search before deleting) and
 * ends with the reply. Eight rounds is far more than a message needs; past
 * that it is going round in circles.
 */
const MAX_STEPS = 8;

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export async function runAgent(input: {
  context: string;
  history: string;
  parts: Part[];
  state: TurnState;
}): Promise<{ ok: true; reply: string } | { ok: false; detail: string }> {
  const first = blocks(input.parts);
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        { type: "text", text: `${input.context}\n\nEl chat hasta ahora:\n${input.history}\n\nSu mensaje nuevo:` },
        // A video is ~18k tokens: cached here, the second round reads it for a tenth.
        ...first.map((b, i) => (i === first.length - 1 ? { ...b, cache_control: { type: "ephemeral" as const } } : b)),
      ],
    },
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    let message: Anthropic.Message;
    try {
      message = await client.messages.create({
        model: DEFAULT_MODEL,
        // A whole protocol in one message is six products in one call: 2.000 cut it (21-oct-2026).
        max_tokens: 8_000,
        // Tools, then the rules: the fixed part, cached. His data goes after the cut.
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages,
      });
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : "Anthropic call failed" };
    }
    if (message.stop_reason === "max_tokens") return { ok: false, detail: "truncated at max_tokens" };

    const uses = message.content.filter((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
    if (message.stop_reason !== "tool_use" || uses.length === 0) {
      const text = message.content
        .flatMap((c) => (c.type === "text" ? [c.text] : []))
        .join("\n")
        .trim();
      return { ok: true, reply: sinRayas(text) };
    }

    messages.push({ role: "assistant", content: message.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    // One after another: two tools in the same round can touch the same rows.
    for (const use of uses) {
      const r = await runTool(use.name, use.input, input.state);
      results.push({ type: "tool_result", tool_use_id: use.id, content: r.content, is_error: r.isError });
    }
    messages.push({ role: "user", content: results });
  }
  return { ok: false, detail: `more than ${MAX_STEPS} rounds` };
}
