import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "~/db";
import { codeRecords } from "~/db/schema";

/**
 * GitHub, folded into one row per day.
 *
 * 🚨 Lines come from `commit` rows ONLY. A merged PR's `additions` are the same
 * lines its commits already reported, so summing both kinds would roughly
 * double every number on the card. PRs are counted, never measured.
 */
export interface CodeDay {
  day: string;
  commits: number;
  prs: number;
  prsMerged: number;
  additions: number;
  deletions: number;
  /** Ordered by how much of the day's diff each one was. */
  repos: { repo: string; commits: number; lines: number }[];
  /** The PRs themselves, for the day detail. */
  pullRequests: {
    repo: string;
    number: string;
    title: string | null;
    url: string | null;
    merged: boolean;
    /** Hand-written lines in the PR's own diff. NOT part of the day's total. */
    additions: number | null;
    deletions: number | null;
  }[];
}

export async function listCodeDays(author?: string): Promise<CodeDay[]> {
  const rows = await db
    .select({
      day: codeRecords.day,
      kind: codeRecords.kind,
      repo: codeRecords.repo,
      externalId: codeRecords.externalId,
      title: codeRecords.title,
      url: codeRecords.url,
      additions: codeRecords.additions,
      deletions: codeRecords.deletions,
      merged: codeRecords.merged,
    })
    .from(codeRecords)
    .where(and(sql`${codeRecords.day} is not null`, author ? eq(codeRecords.author, author) : undefined))
    .orderBy(asc(codeRecords.at));

  const byDay = new Map<string, CodeDay>();
  const repoTally = new Map<string, Map<string, { commits: number; lines: number }>>();

  for (const r of rows) {
    if (!r.day) continue;
    const d = byDay.get(r.day) ?? {
      day: r.day,
      commits: 0,
      prs: 0,
      prsMerged: 0,
      additions: 0,
      deletions: 0,
      repos: [],
      pullRequests: [],
    };

    if (r.kind === "commit") {
      d.commits += 1;
      d.additions += r.additions ?? 0;
      d.deletions += r.deletions ?? 0;
      const per = repoTally.get(r.day) ?? new Map();
      const e = per.get(r.repo) ?? { commits: 0, lines: 0 };
      e.commits += 1;
      e.lines += (r.additions ?? 0) + (r.deletions ?? 0);
      per.set(r.repo, e);
      repoTally.set(r.day, per);
    } else {
      d.prs += 1;
      if (r.merged) d.prsMerged += 1;
      d.pullRequests.push({
        repo: r.repo,
        number: r.externalId,
        title: r.title,
        url: r.url,
        merged: r.merged ?? false,
        additions: r.additions,
        deletions: r.deletions,
      });
    }

    byDay.set(r.day, d);
  }

  for (const [day, per] of repoTally) {
    const d = byDay.get(day);
    if (!d) continue;
    d.repos = [...per.entries()]
      .map(([repo, v]) => ({ repo, ...v }))
      .sort((a, b) => b.lines - a.lines);
  }

  return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
}
