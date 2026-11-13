/**
 * Runs on every build (`pnpm build`), before `next build`.
 *
 * 1. Every `drizzle/*.sql`, in name order. They are all idempotent, so there
 *    is no ledger to drift: a file committed is a file applied on the next
 *    production deploy.
 * 2. In production only, the 10-minute tick: pg_cron in the database calls
 *    `/api/sync`. Vercel Hobby runs a cron once a day, which is not real time.
 *
 * Without DATABASE_URL (preview builds, a laptop) it does nothing.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("migrate: no DATABASE_URL, skipped");
  process.exit(0);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
const dir = join(process.cwd(), "drizzle");

for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  await sql.unsafe(readFileSync(join(dir, file), "utf8"));
  console.log(`migrate: ${file}`);
}

// 🚨 Every table but the login's is per person (`202611131800_multi_usuario.sql`):
// its `user_id`, RLS on and the `own_rows` rule. A new table without them
// would show one person's rows to everyone, so the deploy stops here.
const loose = await sql<{ name: string }[]>`
  select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and (
    case when c.relname like 'auth\\_%' then has_table_privilege('pulso_user', c.oid, 'select')
    else not c.relrowsecurity
      or not exists (select from pg_policy p where p.polrelid = c.oid and p.polname = 'own_rows')
      or not exists (select from pg_attribute a where a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped)
    end)`;
if (loose.length > 0) {
  console.error(`migrate: sin dueño por persona: ${loose.map((t) => t.name).join(", ")}. Mira 202611131800_multi_usuario.sql.`);
  await sql.end();
  process.exit(1);
}

const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const secret = process.env.SYNC_SECRET;
if (process.env.VERCEL_ENV === "production" && host && secret && process.env.DEMO_MODE !== "1") {
  try {
    await sql`create extension if not exists pg_cron`;
    await sql`create extension if not exists pg_net`;
    // The secret lives in Supabase Vault, never in the text of the cron job.
    const [stored] = await sql`select id from vault.secrets where name = 'health_sync_secret'`;
    if (stored) await sql`select vault.update_secret(${stored.id}, ${secret})`;
    else await sql`select vault.create_secret(${secret}, 'health_sync_secret')`;
    const call =
      `select net.http_post(url := 'https://${host}/api/sync', ` +
      `headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret ` +
      `from vault.decrypted_secrets where name = 'health_sync_secret')), timeout_milliseconds := 10000)`;
    await sql`select cron.schedule('health-tick', '*/10 * * * *', ${call})`;
    console.log(`migrate: tick every 10 min → https://${host}/api/sync`);
  } catch (err) {
    // The app still works without it: webhooks, the daily cron and opening
    // the board all sync. Say so and keep building.
    console.warn(`migrate: no tick (${err instanceof Error ? err.message : err})`);
  }
}

await sql.end();
