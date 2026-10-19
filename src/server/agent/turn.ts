import { and, desc, lt, notInArray } from "drizzle-orm";

import { db } from "~/db";
import { chatMessages, type Channel } from "~/db/schema";
import { toBubbles } from "~/lib/bubbles";
import { localClock, localDay } from "~/lib/day";
import { buildContext } from "~/server/assistant/context";
import { recentWhatsapp } from "~/server/evolution/sync";
import { noteCommitments } from "~/server/queries/commitments";
import { loadToday, type TodoRow } from "~/server/queries/today";
import { runAgent } from "./agent";
import type { Part } from "./parts";
import { pendingReminders, whenText } from "./reminders";
import type { TurnState } from "./tools";

/**
 * One message from him, by WhatsApp or from the panel, to the reply: a few
 * short messages, the way a friend answers. The caller has already saved his
 * message and sends these as bubbles, always as text.
 */
export async function agentTurn(input: {
  channel: Channel;
  /** His message's row in `chat_messages`. */
  messageId: number;
  /** Photos sent together: every row of the group, read in this turn and so not in its history. */
  group?: number[];
  parts: Part[];
  at: Date;
  /** Set when the message carried a photo or a video. */
  photo: boolean;
}): Promise<{ ok: boolean; messages: string[]; actions: string[]; sync: boolean; detail?: string }> {
  const now = new Date();
  const [context, today, reminders, history, whatsapp] = await Promise.all([
    buildContext(now),
    loadToday(now),
    pendingReminders(),
    loadHistory(input.messageId, input.group ?? []),
    recentWhatsapp(localDay(now)),
  ]);
  const state: TurnState = {
    now,
    at: input.at,
    chatMessageId: input.messageId,
    photo: input.photo ? input.messageId : null,
    image: input.parts.flatMap((p) => (p.kind === "image" ? [{ data: p.data, mime: p.mime }] : []))[0] ?? null,
    changes: [],
    done: [],
    trained: false,
    sync: false,
    actions: [],
    titles: Object.fromEntries(today.rows.map((r) => [r.key, r.title])),
  };
  const extra = [
    `\nSu lista de hoy (${today.day}), con la [clave] para marcar:`,
    ...today.rows.map(rowLine),
    "\nRecordatorios pendientes:",
    ...(reminders.length > 0 ? reminders.map((r) => `- [${r.id}] ${r.body}, ${whenText(r.at, now)}`) : ["- Ninguno."]),
    ...(whatsapp.length > 0 ? ["\nSu WhatsApp de los últimos días (el detalle, con buscar):", ...whatsapp] : []),
    `\nTe escribe desde ${input.channel === "web" ? "su panel" : "WhatsApp"}.`,
  ].join("\n");

  const run = await runAgent({ context: `${context}\n${extra}`, history, parts: input.parts, state });

  // What the tools wrote stays written even if the reply failed: the
  // commitments go in with it, so a second try does not count them twice.
  const noted =
    state.changes.length > 0 || state.done.length > 0 || state.trained
      ? await noteCommitments({ changes: state.changes, done: state.done, trained: state.trained, photo: state.photo, at: input.at })
      : null;

  if (!run.ok) {
    const did = [...state.actions, noted].filter(Boolean).join("\n");
    const messages = did
      ? [did, "Y aquí me he liado. Si falta algo, dímelo otra vez."]
      : ["No he podido leerlo. Mándamelo otra vez o escríbemelo."];
    return { ok: false, messages, actions: state.actions, sync: state.sync, detail: run.detail };
  }
  // The commitments' count is written by code, not the model, and rides on the
  // first bubble: «Apuntado, sentadilla 4x6 a 100. Gimnasio: 3 de 4.» is one message.
  const [first, ...rest] = toBubbles(run.reply);
  const messages = [[first, noted].filter(Boolean).join(" "), ...rest].filter(Boolean);
  return { ok: true, messages: messages.length > 0 ? messages : ["Hecho."], actions: state.actions, sync: state.sync };
}

export function rowLine(r: TodoRow): string {
  const how = r.done ? " (tachada)" : r.tick === "photo" ? " (con foto por WhatsApp)" : r.tick === null ? " (se marca sola)" : "";
  return `- [${r.key}] ${r.title}${r.detail ? `: ${r.detail}` : ""}${how}`;
}

const LABEL: Record<string, string> = { image: "[foto]", video: "[vídeo]", audio: "[nota de voz]", document: "[PDF]" };

/** The last twenty lines before this one, oldest first, from both sides of the chat. */
async function loadHistory(beforeId: number, group: number[]): Promise<string> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(group.length > 0 ? and(lt(chatMessages.id, beforeId), notInArray(chatMessages.id, group)) : lt(chatMessages.id, beforeId))
    .orderBy(desc(chatMessages.id))
    .limit(20);
  if (rows.length === 0) return "(nada todavía)";
  return rows
    .reverse()
    .map((r) => {
      const who = r.direction === "in" ? "Él" : "Tú";
      const body = [LABEL[r.type] ?? null, r.body].filter(Boolean).join(" ");
      return `${who} ${localDay(r.createdAt)} ${localClock(r.createdAt)}: ${body.length > 0 ? body : "[sin texto]"}`;
    })
    .join("\n");
}
