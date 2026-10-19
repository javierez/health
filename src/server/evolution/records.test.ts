import { bodyOf, chatOf, lineText, phoneLabel, slim, toRow, type EvoRecord } from "./records";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const key = (remoteJid: string, extra: Partial<EvoRecord["key"]> = {}) => ({ id: "3EB0A1", fromMe: false, remoteJid, ...extra });

check("a plain number", chatOf(key("34600111222@s.whatsapp.net")), "34600111222");
check("a LID with its number stamped", chatOf(key("1234@lid", { remoteJidAlt: "34600111222@s.whatsapp.net" })), "34600111222");
check("a LID without one waits", chatOf(key("1234@lid")), "lid:1234");
check("a group is not his conversation", chatOf(key("1203630@g.us")), null);
check("nor a status", chatOf(key("status@broadcast")), null);
check("nor a channel", chatOf(key("1203@newsletter")), null);

check("plain text", bodyOf({ conversation: " ¿Cenamos hoy? " }), "¿Cenamos hoy?");
check("a reply or a link", bodyOf({ extendedTextMessage: { text: "Vale" } }), "Vale");
check("a photo's caption", bodyOf({ imageMessage: { caption: "La báscula" } }), "La báscula");
check("a voice note has no words yet", bodyOf({ audioMessage: { seconds: 25 } }), null);
check("empty text is nothing", bodyOf({ conversation: "  " }), null);
check("a business template's text", bodyOf({ templateMessage: { hydratedTemplate: { hydratedContentText: "Tu cita es mañana" } } }), "Tu cita es mañana");
check("the button he tapped", bodyOf({ buttonsResponseMessage: { selectedDisplayText: "Confirmar" } }), "Confirmar");
check("an album's photo, unwrapped", bodyOf({ associatedChildMessage: { message: { imageMessage: { caption: "Playa" } } } }), "Playa");

check(
  "thumbnails and waveforms out, the rest in",
  slim({ message: { imageMessage: { caption: "x", jpegThumbnail: "/9j/AAA", url: "u" } }, list: [{ waveform: "AA", seconds: 3 }] }),
  { message: { imageMessage: { caption: "x", url: "u" } }, list: [{ seconds: 3 }] },
);

const voice = toRow({
  key: key("1234@lid", { remoteJidAlt: "34600111222@s.whatsapp.net" }),
  pushName: "Marta",
  messageType: "audioMessage",
  messageTimestamp: 1760652000, // 2025-10-16 22:00 UTC, 00:00 in Madrid the next day
  message: { audioMessage: { seconds: 25, waveform: "AAAA" } },
});
check("the day is Madrid's", voice?.day, "2025-10-17");
check("the other person's name", voice?.name, "Marta");
check("the voice note's length", voice?.seconds, 25);
check("raw without the waveform", JSON.stringify(voice?.raw).includes("waveform"), false);

const mine = toRow({ key: key("34600111222@s.whatsapp.net", { fromMe: true }), pushName: "Javier", messageType: "conversation", messageTimestamp: "1760652000", message: { conversation: "Voy" } });
check("his own message has no other name", mine?.name, null);
check("a timestamp as text still reads", mine?.at.toISOString(), "2025-10-16T22:00:00.000Z");
check("a reaction is not a message", toRow({ key: key("34600111222@s.whatsapp.net"), messageType: "reactionMessage", messageTimestamp: 1, message: {} }), null);

check("a voice note in a transcript", lineText({ type: "audioMessage", body: null, seconds: 85 }), "[nota de voz 1:25]");
check("with its transcript", lineText({ type: "audioMessage", body: "Llego tarde", seconds: 5 }), "[nota de voz 0:05] Llego tarde");
check("text as is", lineText({ type: "conversation", body: "Vale", seconds: null }), "Vale");
check("an unknown type says so", lineText({ type: "pollCreationMessage", body: null, seconds: null }), "[pollCreationMessage]");

check("a Spanish number, readable", phoneLabel("34600111222"), "+34 600 11 12 22");
check("a foreign one as is", phoneLabel("447700900123"), "+447700900123");
check("a LID is no number", phoneLabel("lid:1234"), "Contacto sin número");

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
