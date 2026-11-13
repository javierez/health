import type { Day as BandDay } from "~/lib/whoop/days";

import type { Finding, Findings, Ranked } from "./findings";
import { parseReading } from "./interpret";
import { OUTCOME_KEYS } from "./outcomes";
import { readingContext } from "./reading";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const empty = (): Ranked => ({ good: [], bad: [], unclear: [], neutral: [] });
const by = Object.fromEntries(OUTCOME_KEYS.map((o) => [o, empty()])) as Findings["by"];
const late = { key: "bed-early", outcome: "recovery", title: "Acostarte antes de las 01:00", big: "+9", sure: true, nights: 40, detail: "Antes: 62 %. Después: 53 %." } as Finding;
by.recovery.good.push(late);
by.recovery.neutral.push({ ...late, key: "caffeine", title: "Tomar café" });
const found = { by, waiting: ["Días con magnesio"], nights: 120, tests: 180, balance: {} } as unknown as Findings;

// 120 mornings, resting pulse 50 in the last 30 and 55 in the 90 before.
const band: BandDay[] = Array.from({ length: 120 }, (_, i) => {
  const day = new Date(Date.UTC(2026, 5, 24 + i)).toISOString().slice(0, 10);
  return { day, rhr: i >= 90 ? 50 : 55, workouts: [], z13Min: 0, z45Min: 0, strengthMin: 0, tracked: true, night: null, steps: null } as unknown as BandDay;
});
const text = readingContext({ today: band.at(-1)!.day, found, band: { days: band, maxHr: 187, age: null, spoken: [] }, progress: ["- Sueño: 7 h esta semana"] });

check("a finding goes with its sign, unit and certainty", text.includes("- Le sienta bien: Acostarte antes de las 01:00: +9 (seguro, 40 noches). Antes: 62 %. Después: 53 %."), true);
check("what does not affect him is listed too", text.includes("- No le afecta: Tomar café."), true);
check("the month against the three before", text.includes("- Pulso en reposo: 50 lpm (antes 55)"), true);
check("VO₂ from his max and resting pulse", text.includes("VO₂máx estimado"), true);
check("his weeks close it", text.trimEnd().endsWith("- Sueño: 7 h esta semana"), true);

const parsed = parseReading({
  summary: "Duermes poco — y tarde.\n Lo demás va bien.",
  conclusions: [
    { area: "sleep", title: "Acuéstate antes de la 01:00", detail: "+9 de recuperación (seguro)" },
    { area: "astrology", title: "Mira las estrellas", detail: "" },
    ...Array.from({ length: 7 }, (_, i) => ({ area: "training", title: `Entreno ${i}`, detail: "" })),
  ],
});
check("one clean paragraph, no long dashes", parsed.summary.includes("—") || parsed.summary.includes("\n"), false);
check("an unknown area is dropped, and six at most", [parsed.items.length, parsed.items.some((r) => r.area === "astrology")], [6, false]);
check("nothing usable is an empty reading", parseReading(null), { summary: "", items: [] });

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`reading: ${passed} passed`);
