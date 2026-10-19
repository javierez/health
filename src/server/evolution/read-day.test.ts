import { dropName, parseRead, renderDay, type DayMessage } from "./read-day";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const at = (hhmm: string) => new Date(`2026-10-15T${hhmm}:00+02:00`);
const msg = (chat: string, fromMe: boolean, hhmm: string, body: string | null, type = "conversation", seconds: number | null = null): DayMessage => ({
  chat,
  fromMe,
  at: at(hhmm),
  type,
  body,
  seconds,
});

const day = [
  msg("34600111222", false, "21:10", "¿Has pagado la factura?"),
  msg("34600111222", true, "21:12", "Mañana"),
  msg("34600111222", false, "21:13", null, "audioMessage", 40),
  msg("34611000000", false, "09:00", "ok"),
];
const names = new Map([["34600111222", "Pedro"]]);
const text = renderDay("2026-10-15", day, names);

check("the header counts it all", text.split("\n")[0], "Día 2026-10-15. 4 mensajes en 2 conversaciones.");
check("the busiest chat goes first, with its name and number", text.split("\n")[2], "## Pedro · 34600111222 · 3 mensajes");
check("his lines are «Él», on Madrid's clock", text.includes("21:12 Él: Mañana"), true);
check("a voice note without words says so", text.includes("21:13 Pedro: [nota de voz 0:40]"), true);
check("a chat with no name gets its number", text.includes("## +34 611 00 00 00 · 34611000000 · 1 mensajes"), true);

const known = new Map([
  ["34600111222", { name: "Pedro", messages: 3 }],
  ["34611000000", { name: "+34 611 00 00 00", messages: 1 }],
]);
const read = parseRead(
  {
    summary: "Tensión con Pedro por una factura — por la noche.",
    mood: 2,
    chats: [
      { chat: "34600111222", line: "Le reclama una factura", tone: "tensa", topic: "Dinero", effect: "Te pudo dejar preocupado." },
      { chat: "34999999999", line: "Un chat que no existe", tone: "buena" },
      { chat: "34611000000", line: "Un ok", tone: "furiosa", topic: "Trabajo", effect: "  " },
    ],
  },
  known,
);
check("dashes out of the summary", read?.summary, "Tensión con Pedro por una factura, por la noche.");
check("a made-up chat is dropped", read?.chats.length, 2);
check("name and count come from the messages", [read?.chats[0]?.name, read?.chats[0]?.messages], ["Pedro", 3]);
check("an unknown tone reads as neutral", read?.chats[1]?.tone, "neutra");
check("an empty effect is none", read?.chats[1]?.effect, null);
check("the topic, from the list", read?.chats[0]?.topic, "Dinero");
check("a topic off the list counts in none, not in «Otros»", read?.chats[1]?.topic, null);
check("the day's mood", read?.mood, 2);
check("a mood as text still counts", parseRead({ summary: "Día", mood: "4", chats: [] }, known)?.mood, 4);
check("no mood leaves the day out, not a made-up 3", parseRead({ summary: "Día", chats: [] }, known)?.mood, null);
check("a mood off the scale is none", parseRead({ summary: "Día", mood: 9, chats: [] }, known)?.mood, null);
check("no summary, no read", parseRead({ chats: [] }, known), null);
const nested = parseRead(
  { chats: JSON.stringify({ summary: "Día tranquilo", chats: [{ chat: "34600111222", line: "Factura", tone: "tensa" }] }) },
  known,
);
check("the whole answer as a string inside chats", [nested?.summary, nested?.chats.length], ["Día tranquilo", 1]);
const listed = parseRead({ summary: "Día", chats: JSON.stringify([{ chat: "34611000000", line: "Un ok", tone: "neutra" }]) }, known);
check("the list as a string", listed?.chats[0]?.name, "+34 611 00 00 00");

check("the name is not said twice", dropName("Lucía gestiona la cita", "Lucia"), "Gestiona la cita");
check("nor with a surname on the label", dropName("Pablo, cuadrar la comida", "Pablo Vallejo"), "Cuadrar la comida");
check("a line about someone else stays", dropName("Le pide la factura", "Pedro"), "Le pide la factura");
check("a line that is only the name stays", dropName("Amaya", "Amaya"), "Amaya");

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
