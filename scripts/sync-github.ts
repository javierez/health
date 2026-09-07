/** Pulls commits and PRs into `code_records`. `--since 2025-10-30` to bound it. */
import { syncGithub } from "~/server/github/sync";

async function main() {
  const i = process.argv.indexOf("--since");
  const report = await syncGithub({ since: i >= 0 ? process.argv[i + 1] : undefined });
  console.log(
    `${report.commits} commits · ${report.prs} PRs · +${report.additions} −${report.deletions}`,
  );
  for (const e of report.errors.slice(0, 20)) console.error(`  ✗ ${e}`);
  process.exit(report.errors.length > 0 ? 1 : 0);
}

void main();
