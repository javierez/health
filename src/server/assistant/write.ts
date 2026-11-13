import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import type { Recommendation } from "~/db/schema";
import { env } from "~/env";
import { sinRayas } from "~/lib/sin-rayas";
import { DEFAULT_MODEL } from "~/server/classify/episodes";
import type { Aviso } from "./day-reminders";
import { EVIDENCE_LINES } from "./evidence";
import { clock, type BedtimePlan, type MessageKind } from "./plan";
import { VOZ } from "./voice";

/**
 * WHAT the assistant says. The timing and the bedtime are already decided by
 * `plan.ts`; the model only turns them, and the context, into a few concrete
 * things to do: one WhatsApp paragraph and the same advice as a list, which is
 * what the top of the board shows.
 */
const SYSTEM = `Eres el asistente personal de salud de Javier. Le escribes por WhatsApp y le preparas la lista del día en su panel. Tienes sus datos de WHOOP, lo que se ha oído en sus grabaciones, lo que te ha mandado al chat (fotos de comida, la báscula, vídeos de entreno), cómo van sus semanas (sueño, entreno, peso, código y llamadas de trabajo) y su ficha médica.

${VOZ}

Qué dices:
- Recomendaciones y recordatorios, no un resumen de sus datos (Javier, 21-oct-2026): lo que tiene que hacer y cuándo. Un dato suyo solo como el porqué de algo que hacer.
- Solo cosas concretas que hacer, con hora o cantidad cuando se pueda. Nada de consejos genéricos.
- Sus rutinas de hoy van en su hora: en ayunas al levantarse, media mañana, antes de entrenar si entrena, las cremas de mañana y de noche. Cada suplemento con su dosis si la tiene.
- Mira la tendencia de las semanas antes que un día suelto: si lleva tres semanas durmiendo menos de lo que necesita, eso manda.
- Te basas solo en los datos que te paso. Si algo no está, no lo inventes.
- Lo que no está apuntado no es 0 (25-oct-2026: «0 de 120 g de proteína» y «agua 0 de 2» un día que no había apuntado nada). Sin comida apuntada hoy, ni gramos ni lo que le falta: si toca, pregúntale qué ha comido. Un compromiso que marca él y sigue sin marcar se recuerda, nunca «llevas 0». El agua cuenta los litros que dice que ha bebido: con «nada apuntado aún», pregúntale cuánta lleva («¿Cuánta agua llevas?»); con algo apuntado, lo que le falta en litros, nunca en vasos. Un entreno que la banda no ve, igual: se pregunta.
- Una noche «aún sin cerrar» es lo dormido hasta ahora, no la noche: no digas cuánto ha dormido. Una cifra «estimada» la calcula health sin WHOOP: dila como aproximada («sobre un 45 %»).
- Lo médico, solo lo que está en su ficha o se le ha oído decir a un médico. No diagnosticas. Si algo preocupa (un síntoma que se repite, algo que choca con lo que le dijo el médico), le dices que lo consulte con su médico.
- «Lo que viene» trae cada cita con su día ya resuelto: el día sale de ahí, nunca lo calculas tú, y sin hora no le pones una. Lo de hoy manda sobre todo lo demás: va en la primera línea con su hora y lo que le dijeron que hiciera (ir acompañado, qué llevar). Lo de mañana se prepara hoy: a qué hora salir, qué llevar.
- Lo que se queda a medias se retoma, una vez: una cita de hoy ya pasada sin nada oído después, pregúntale qué le dijeron, para apuntarlo; un síntoma que contó ayer, cómo va. Si ya lo ha contado, nada.
- Una noche corta va con las horas en que la contó la banda («6 h 39, de 01:10 a 08:19»): empieza a contar tarde si tarda en dormirse, y así él ve si se le escapó algo.
- «Lo que te ha corregido él» manda sobre estas reglas.
- Algo pendiente de su ficha (una cita que pedir) solo si sigue pendiente: si en «Lo médico de los 30 últimos días» ya se hizo, ya tiene cita o se oyó el resultado, está hecho y no lo nombras. Y una vez al día como mucho, no en cada mensaje. Una prueba ya hecha (una punción, un PET) tampoco: ni su resultado ni que lo apunte, cuando llegue ya te lo dirá.

Lo que dice la ciencia. Tus consejos de sueño, comida y entreno salen de aquí, con sus datos; cuando uses uno, pon la fuente corta al final del detail, entre paréntesis:
${EVIDENCE_LINES}

message: se lee de un vistazo en el móvil. Una primera línea corta con lo que más manda hoy o esta noche (su dato si hace falta). Debajo, de una a tres líneas que empiezan por «• », cada una una cosa que hacer con su hora o cantidad ("• Pesas 25 min a las 18:00"). 300 caracteres como mucho en total. Sin emojis, sin asteriscos, sin saludo ni despedida. El resto va en items, no en el mensaje.
items: de 3 a 5 cosas que hacer hoy, de la más importante a la menos. title en imperativo y corto ("Entreno suave, 40 min de zona 2"); detail con el porqué en una línea, con su dato ("Recuperación 38 %, tercera semana por debajo de 50"). La hora de acostarse ya sale aparte en la lista: no la repitas ni pongas otra.`;

const TOOL: Anthropic.Tool = {
  name: "escribir",
  description: "El mensaje de WhatsApp y la lista de lo que toca hoy.",
  input_schema: {
    type: "object",
    properties: {
      message: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            area: { type: "string", enum: ["sleep", "training", "food", "medical", "work"] },
            title: { type: "string" },
            detail: { type: "string" },
          },
          required: ["area", "title", "detail"],
        },
      },
      avisos: {
        type: "array",
        items: {
          type: "object",
          properties: { hora: { type: "string" }, texto: { type: "string" }, de: { type: "string" } },
          required: ["hora", "texto"],
        },
      },
    },
    required: ["message", "items"],
  },
  cache_control: { type: "ephemeral" },
};

const TASK: Record<MessageKind, (plan: BedtimePlan, avisos: number) => string> = {
  bedtime: (p) =>
    `Escribe el aviso de irse a dormir. Hora de acostarse: ${clock(p.bedMinutes)}, para dormir ${Math.floor(p.needMinutes / 60)} h ${p.needMinutes % 60} min y levantarse a las ${clock(p.wakeMinutes)}. Dile la hora y lo que tiene que hacer en la próxima media hora, lo uno o dos que más cuenten según lo que ha comido, bebido y entrenado hoy y lo que pide su ficha médica. Si en «Hoy, ánimo» pone sin apuntar, termina con una sola pregunta: qué tal el día, del 1 al 10. Si no, sin pregunta. En items, lo de esta noche y mañana a primera hora.`,
  commitments: () => COMMITMENTS_TASK,
  morning: (p, n) =>
    `Escribe la nota de la mañana: si hay algo hoy en «Lo que viene», eso la abre, con su hora; después cómo ha dormido y recuperado en una frase, y lo que más cambia hoy de esto: cuánto entrenar según la recuperación y sus compromisos de la semana (si hoy toca, en qué hueco de la agenda), qué comer o lo que su ficha médica le pide hacer hoy (si no le pide nada, ni la nombres). Esta noche, a la cama a las ${clock(p.bedMinutes)}: si lo dices, esa hora y no otra. En items, la lista de hoy, sin la hora de acostarse. En avisos, hasta ${n} WhatsApps para el resto del día, cada uno en el momento de hacer algo (el entreno en su hueco de la agenda, la comida que le falta, su rutina). Con una cita hoy en «Lo que viene», los dos primeros son suyos: salir a tiempo (una hora antes, con lo que tenga que llevar) y, una hora después, qué le han dicho. Todos con al menos una hora entre uno y otro y nada que ya esté hecho hoy: hora (HH:MM de hoy, antes de las 22:30), texto (una frase con su dato) y, si es sobre uno de los items, de con su title exacto.`,
};

const COMMITMENTS_TASK = `Escribe el aviso de la tarde sobre sus compromisos: va por detrás en alguno y hoy no consta ningún entreno. Si la banda no detecta entrenos y no ha contado ninguno hoy, empieza preguntando si ha entrenado, en una línea, y sigue como si no. Lo que le queda y cuántos días, y si toca hoy o mejor otro día: con buena recuperación, hoy, en el hueco de la agenda que tenga; con la recuperación baja o mal dormido, algo suave hoy o el día con hueco que mejor le venga. Si ya no da para cumplirlo entero, dilo sin drama y propón lo que sí. En items, lo de hoy y mañana para cumplir.`;

const item = z.object({
  area: z.enum(["sleep", "training", "food", "medical", "work"]),
  title: z.string().min(1),
  detail: z.string().catch(""),
});

const aviso = z.object({ hora: z.string(), texto: z.string(), de: z.string().optional().catch(undefined) });

export function parseWritten(input: unknown): { text: string; items: Recommendation[]; avisos: Aviso[] } {
  const o = (input ?? {}) as { message?: unknown; items?: unknown; avisos?: unknown };
  // Its lines stay (a first line and its «• » list); each one clean. The
  // template, which takes one line, joins them (`oneLine` in whatsapp.ts).
  const text =
    typeof o.message === "string"
      ? sinRayas(o.message)
          .split("\n")
          .map((l) => l.replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .join("\n")
          .slice(0, 700)
      : "";
  const items = (Array.isArray(o.items) ? o.items : []).flatMap((i) => {
    const r = item.safeParse(i);
    return r.success ? [{ area: r.data.area, title: sinRayas(r.data.title.trim()), detail: sinRayas(r.data.detail.trim()) }] : [];
  });
  const avisos = (Array.isArray(o.avisos) ? o.avisos : []).flatMap((a) => {
    const r = aviso.safeParse(a);
    return r.success ? [r.data] : [];
  });
  return { text, items: items.slice(0, 5), avisos };
}

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export async function writeMessage(
  kind: MessageKind,
  plan: BedtimePlan,
  context: string,
  avisos = 0,
): Promise<({ ok: true } & ReturnType<typeof parseWritten>) | { ok: false; detail: string }> {
  try {
    const message = await client.messages.create({
      model: DEFAULT_MODEL,
      // Up to eight reminders on top of the note and its list.
      max_tokens: 2_000,
      // The rules and the tool are the fixed part, cached; his data changes
      // every time and goes after the cut.
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: `${context}\n\n${TASK[kind](plan, avisos)}` }],
    });
    const block = message.content.find((c) => c.type === "tool_use");
    if (!block || block.type !== "tool_use") return { ok: false, detail: "no tool_use block" };
    const written = parseWritten(block.input);
    return written.text ? { ok: true, ...written } : { ok: false, detail: "empty reply" };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "Anthropic call failed" };
  }
}
