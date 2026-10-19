/**
 * Only what came from Pocket, WhatsApp and WHOOP (Javier, 18-oct-2026:
 * «delete all mock data… start with ALL POCKET, whatsapp and whoop only»).
 * Everything else that holds his data is emptied: what he typed in the web
 * chat, the products, the insights, the agent's notes, GitHub. What is not
 * data stays: his login, the WHOOP and Google connections, the medical
 * history, and the drawings and learned exercises (they cost money to make).
 *
 *   DATABASE_URL="$(security find-generic-password -s salud-db -w)" pnpm tsx scripts/empezar-de-cero.ts           # dry: counts only
 *   … scripts/empezar-de-cero.ts --write
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
const write = process.argv.includes("--write");

/** Table → what it is. Emptied whole. */
const WIPE: Record<string, string> = {
  assistant_messages: "avisos que escribió el asistente",
  reminders: "recordatorios",
  commitments: "compromisos",
  checks: "hábitos marcados",
  products: "productos",
  product_uses: "usos de productos",
  hypotheses: "cosas a comparar",
  experiments: "experimentos",
  photos: "fotos",
  code_records: "GitHub",
};
const KEEP: Record<string, string> = {
  recordings: "Pocket: grabaciones",
  episodes: "Pocket: episodios",
  whoop_records: "WHOOP",
  wa_messages: "WhatsApp: mensajes",
  wa_days: "WhatsApp: días leídos",
  medical: "historial médico",
  auth_user: "tu usuario",
  oauth_tokens: "conexiones WHOOP / Google",
  kinds: "dibujos",
  exercise_moves: "ejercicios aprendidos",
};

const count = async (table: string, where = "true") => {
  const [r] = await sql.unsafe(`select count(*)::int as n from ${table} where ${where}`);
  return r!.n as number;
};

console.log("SE BORRA");
for (const [t, label] of Object.entries(WIPE)) console.log(`  ${String(await count(t)).padStart(6)}  ${label} (${t})`);
// The chat: what he typed in the web panel goes; the 621 is WhatsApp and stays.
// Facts hang from their message, so the web ones go with it.
console.log(`  ${String(await count("chat_messages", "channel = 'web'")).padStart(6)}  chat de la web (chat_messages)`);
console.log(`  ${String(await count("facts", "chat_message_id in (select id from chat_messages where channel = 'web')")).padStart(6)}  hechos de ese chat (facts)`);
console.log("SE QUEDA");
for (const [t, label] of Object.entries(KEEP)) console.log(`  ${String(await count(t)).padStart(6)}  ${label} (${t})`);
console.log(`  ${String(await count("chat_messages", "channel = 'whatsapp'")).padStart(6)}  chat del 621 (chat_messages)`);
console.log(`  ${String(await count("facts", "chat_message_id is null or chat_message_id in (select id from chat_messages where channel = 'whatsapp')")).padStart(6)}  hechos de Pocket y del 621 (facts)`);

if (write) {
  await sql.begin(async (tx) => {
    await tx.unsafe(`truncate ${Object.keys(WIPE).join(", ")} restart identity`);
    await tx.unsafe(`delete from chat_messages where channel = 'web'`);
  });
  console.log("Hecho.");
} else {
  console.log("Dry-run: añade --write para borrarlo.");
}
await sql.end();
