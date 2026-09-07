/** Pulls WHOOP into `whoop_records`. `--since 2026-01-01` to bound it. */
import { syncWhoop } from "~/server/whoop/sync";

const i = process.argv.indexOf("--since");
const since = i >= 0 ? process.argv[i + 1] : undefined;

const report = await syncWhoop({ since });
console.log(report.fetched);
for (const e of report.errors) console.error(`  ✗ ${e}`);
process.exit(report.errors.length > 0 ? 1 : 0);
