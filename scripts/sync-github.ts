/**
 * Pulls commits and PRs into `code_records`. `--since 2025-10-30` to bound it,
 * `--author gonzalolopezgarcia` for one person only.
 */
import { syncGithub } from "~/server/github/sync";

async function main() {
  const arg = (flag: string) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const author = arg("--author");
  const report = await syncGithub({ since: arg("--since"), authors: author ? [author] : undefined });
  console.log(
    `${report.commits} commits · ${report.prs} PRs · +${report.additions} −${report.deletions}`,
  );
  for (const e of report.errors.slice(0, 20)) console.error(`  ✗ ${e}`);
  process.exit(report.errors.length > 0 ? 1 : 0);
}

void main();
