import type Anthropic from "@anthropic-ai/sdk";

/** What a message brought, already turned into something the model reads. */
export type Part =
  | { kind: "text"; text: string }
  | { kind: "image"; data: Buffer; mime: string }
  | { kind: "frames"; frames: { second: number; jpeg: Buffer }[] }
  | { kind: "pdf"; data: Buffer };

const media = (mime: string) =>
  (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime) ? mime : "image/jpeg") as
    | "image/jpeg"
    | "image/png"
    | "image/webp"
    | "image/gif";

export function blocks(parts: Part[]): Anthropic.ContentBlockParam[] {
  return parts.flatMap((p): Anthropic.ContentBlockParam[] => {
    if (p.kind === "text") return [{ type: "text", text: p.text }];
    if (p.kind === "image") {
      return [{ type: "image", source: { type: "base64", media_type: media(p.mime), data: p.data.toString("base64") } }];
    }
    if (p.kind === "pdf") {
      return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: p.data.toString("base64") } }];
    }
    return [
      { type: "text", text: `Vídeo, ${p.frames.length} fotogramas en orden:` },
      ...p.frames.flatMap((f): Anthropic.ContentBlockParam[] => [
        { type: "text", text: `${f.second} s` },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.jpeg.toString("base64") } },
      ]),
    ];
  });
}
