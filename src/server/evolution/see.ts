import Anthropic from "@anthropic-ai/sdk";

import { env } from "~/env";
import { sinRayas } from "~/lib/sin-rayas";
import { READABLE } from "~/server/chat/media";
import { DEFAULT_MODEL } from "~/server/classify/episodes";

/**
 * A photo of a followed chat in one sentence, so the day's reading and the
 * agent's search know what was sent, not just that a photo was (14-nov-2026).
 */
const SYSTEM = `Describes una foto que se mandaron por WhatsApp Javier y otra persona. Una sola frase con lo que se ve: el sitio, la comida, lo que están haciendo, un documento y lo que dice si se lee (una receta, un resultado, una entrada, una captura). Si es comida o bebida, cada alimento con su cantidad a ojo: «un plato de lentejas con chorizo, unos 300 g, dos rebanadas de pan y una caña». A las personas no las identificas ni opinas de su aspecto: «una mujer sonriendo en una terraza». Máximo 250 caracteres. Nada de rayas largas ni medias.`;

/**
 * A WhatsApp photo goes as it came: already a JPEG of a few hundred KB, and
 * the API scales a big one down itself (~1.600 tokens at most). No ffmpeg:
 * it is traced only into the WhatsApp webhook (`next.config.js`), and this
 * runs in the tick. The API takes 5 MB of base64 an image.
 */
const MAX_BYTES = 3_700_000;

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

/** Null for what the model cannot open (an iPhone photo sent as a file is HEIC). */
export async function seePhoto(bytes: Buffer, mime: string): Promise<string | null> {
  const type = mime.split(";")[0]!.trim();
  if (!READABLE.has(type) || bytes.length > MAX_BYTES) return null;
  const message = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 300,
    thinking: { type: "disabled" },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: type as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: bytes.toString("base64") },
          },
        ],
      },
    ],
  });
  const text = message.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join(" ").trim();
  return text ? sinRayas(text).slice(0, 300) : null;
}
