/**
 * The band without the subscription, by hand: Edge's database (Profile →
 * Settings → Export, backup, import → Database), AirDropped to the Mac, into
 * Supabase through `/api/webhooks/edge` (see `server/edge/from-db.ts`).
 * Re-running is safe: the endpoint upserts, and a day WHOOP scored keeps WHOOP's.
 *
 *   set -a && source .env.local && set +a && pnpm tsx scripts/import-edge-db.ts ~/Downloads/openstrap.db           # dry-run
 *   set -a && source .env.local && set +a && pnpm tsx scripts/import-edge-db.ts ~/Downloads/openstrap.db --write
 */
// @ts-expect-error: node:sqlite ships with Node 22; @types/node here is 20.
import { DatabaseSync } from "node:sqlite";

import { env } from "~/env";
import { edgeDbExtras, edgeDbPush, type EdgeDbRows } from "~/server/edge/from-db";

const URL = "https://health-five-livid.vercel.app/api/webhooks/edge";
const file = process.argv[2];
const write = process.argv.includes("--write");
if (!file) throw new Error("usage: import-edge-db.ts <openstrap.db> [--write]");

const sqlite = new DatabaseSync(file, { readOnly: true });
const all = (q: string) => sqlite.prepare(q).all() as Record<string, unknown>[];
const rows: EdgeDbRows = {
  daily: all("select * from v_daily order by date"),
  windows: all("select day_id, window_json from day_result where skipped = 0 order by computed_at") as EdgeDbRows["windows"],
  sessions: all("select * from v_sessions order by start_ts"),
  minutes: all(
    "select (ts_ms / 60000) * 60 as t, min(hr) as min, round(avg(hr)) as avg, max(hr) as max from decoded_onehz where hr > 0 and coalesce(hr_valid, 1) = 1 group by 1 order by 1",
  ) as EdgeDbRows["minutes"],
};

const push = edgeDbPush(rows);
const extras = edgeDbExtras(rows);
const h = (min: number | null | undefined) => (min == null ? "–" : `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}`);
const v = (x: number | null | undefined) => (x == null ? "–" : String(Math.round(x)));
const perDay = new Map(extras.map((b) => [b.data.metrics.find((m) => m.name === "edge_daily")?.data[0]?.date, b.data.metrics.find((m) => m.name === "heart_rate")?.data.length ?? 0]));

console.log("día         sueño    reposo  HRV  recup.  esfuerzo  min. de pulso");
for (const d of push.days) {
  console.log(
    `${d.date}  ${h(d.sleep_min).padEnd(7)}  ${v(d.resting_hr).padEnd(6)}  ${v(d.hrv).padEnd(3)}  ${v(d.readiness).padEnd(6)}  ${(d.strain?.toFixed(1) ?? "–").padEnd(8)}  ${perDay.get(d.date) ?? 0}`,
  );
}
console.log(`${push.workouts.length} entrenos · ${rows.minutes.length} minutos de pulso en ${extras.length} días`);

if (!write) {
  console.log("dry-run: nada enviado. Añade --write para subirlo.");
  process.exit(0);
}

async function send(body: unknown) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.EDGE_PUSH_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { success: boolean; data?: unknown; error?: string };
  if (!json.success) throw new Error(`${res.status}: ${json.error}`);
  return json.data;
}

console.log("noches, recuperación y entrenos:", await send(push));
for (const body of extras) console.log(body.data.metrics.find((m) => m.name === "edge_daily")?.data[0]?.date ?? "", await send(body));
