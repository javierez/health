import { eq, sql } from "drizzle-orm";

import { db } from "~/db";
import { codeRecords } from "~/db/schema";
import { env } from "~/env";

/**
 * GitHub → `code_records`.
 *
 * 🚨 The lines come from the COMMIT endpoint, one call each, because nothing
 * cheaper is honest. The search API returns commits without stats, and the
 * events API only goes back 90 days and 300 events. So a full pass is one
 * request per commit — ~3.600 for a year, inside the 5.000/h core budget — and
 * every later pass is incremental off `code_records`, which is why `--since`
 * defaults to the day after the newest row we already have.
 *
 * PRs are fetched separately and their lines are NOT summed into the day: a
 * merged PR's additions are the same lines its commits already reported.
 */
const API = "https://api.github.com";

interface SearchCommit {
  sha: string;
  commit: { message: string; author: { date: string } | null };
  repository: { full_name: string };
}

interface CommitDetail {
  sha: string;
  html_url: string;
  parents?: { sha: string }[];
  stats?: { additions: number; deletions: number };
  files?: CommitFile[];
}

interface CommitFile {
  filename: string;
  additions: number;
  deletions: number;
}

/**
 * 🚨 Lines are counted from the FILES, not from `stats`, so that generated
 * output does not drown the day. Measured on the first full pass: `stats` gave
 * +3.746.464 for ten months, and a single `pnpm-lock.yaml` commit was 380.000
 * of it. A day where you regenerated a lockfile is not a day you wrote a
 * hundred thousand lines, and a card that says so is worse than no card.
 *
 * GitHub returns only the first 300 files inline, which is exactly where the
 * numbers went wrong the first time: every big commit came back with
 * `changed_files: 300` and fell through to the raw `stats`. The file list
 * paginates, so it is paged instead of guessed.
 */
const GENERATED = [
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|poetry\.lock|Cargo\.lock|go\.sum|composer\.lock|Gemfile\.lock)$/,
  /(^|\/)(dist|build|node_modules|vendor|\.next|coverage)\//,
  // Data dumps, not written lines. One `backups/*/s3-image-keys.txt` commit in
  // `vestaingestion` was +1.369.716 on its own — more than the rest of the
  // year of real code put together.
  /(^|\/)(backups?|dumps?|fixtures|snapshots|__fixtures__)\//,
  // Eval and test OUTPUT. One `feat(vesta): trabajo de la semana` commit was
  // +121.150, of which 422 files were `scripts/eval/results/*.json` at ~1.900
  // lines each. A run you executed is not a day you wrote.
  /(^|\/)(results|out|output|logs|artifacts|\.turbo)\//,
  /\.(log|snap)$/,
  // Backups by NAME rather than by folder — `vestaingestion` writes them
  // beside the scripts: `backup-solar-plot-area-all.json` alone was +24.894.
  /(^|\/)backup[-_.]/,
  // Drizzle's schema snapshots and Tailwind's compiled sheet are both build
  // output that happens to live in source folders.
  /(^|\/)drizzle\/meta\//,
  /(^|\/)output\.css$/,
  /\.(csv|tsv|ndjson|geojson|parquet|sqlite|db)$/,
  /\.(min\.(js|css)|map|lock)$/,
  /(^|\/)__snapshots__\//,
];

function isGenerated(path: string): boolean {
  return GENERATED.some((re) => re.test(path));
}

function handWritten(files: CommitFile[]): {
  additions: number;
  deletions: number;
  changedFiles: number;
} {
  let additions = 0;
  let deletions = 0;
  let changedFiles = 0;
  for (const f of files) {
    if (isGenerated(f.filename)) continue;
    additions += f.additions;
    deletions += f.deletions;
    changedFiles += 1;
  }
  return { additions, deletions, changedFiles };
}

/**
 * Every file of a commit, past the 300 GitHub hands back inline. Ten pages is
 * 1.000 files; anything bigger than that is a vendored import, not a day's
 * work, and the tail it drops would be noise anyway.
 */
async function commitFiles(repo: string, sha: string): Promise<CommitFile[] | null> {
  const first = await get<CommitDetail>(`/repos/${repo}/commits/${sha}?per_page=100`);
  // 🚨 A MERGE COMMIT repeats the whole branch. `Merge pull request #701` and
  // the commit it merged both reported +121.150 — the same lines, counted
  // twice, on the same day. More than one parent means skip it.
  if ((first.parents?.length ?? 1) > 1) return null;
  const files = first.files ?? [];
  if (files.length < 100) return files;
  for (let page = 2; page <= 10; page++) {
    const next = await get<CommitDetail>(`/repos/${repo}/commits/${sha}?per_page=100&page=${page}`);
    const batch = next.files ?? [];
    files.push(...batch);
    if (batch.length < 100) break;
  }
  return files;
}

interface SearchPr {
  number: number;
  title: string;
  created_at: string;
  html_url: string;
  pull_request?: { merged_at: string | null };
  repository_url: string;
}

type PrFile = CommitFile;

function headers(): Record<string, string> {
  const token = env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN missing — run `gh auth token`");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 🚨 GitHub's SECONDARY rate limit is not the one in `/rate_limit`. It fires on
 * request *bursts* regardless of the hourly budget — the first full pass died on
 * a 403 with `core.remaining` still at 5.000 — and the only correct response is
 * to back off and retry, never to fail the pass. `Retry-After` is honoured when
 * sent; otherwise the wait doubles.
 */
async function get<T>(path: string, attempt = 0): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    headers: headers(),
  });
  if (res.ok) return (await res.json()) as T;

  const throttled = res.status === 403 || res.status === 429;
  if (throttled && attempt < 8) {
    // Two different limits wear the same 403. The PRIMARY one is hourly and
    // says so in the headers: exponential backoff never reaches its reset, so
    // the pass died with `remaining: 0` after paginating. Wait it out.
    const remaining = Number(res.headers.get("x-ratelimit-remaining"));
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    if (remaining === 0 && Number.isFinite(reset)) {
      await sleep(Math.max(reset * 1000 - Date.now(), 0) + 5000);
      return get<T>(path, attempt);
    }
    const after = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : 5000 * 2 ** attempt);
    return get<T>(path, attempt + 1);
  }
  throw new Error(`${res.status} ${path} — ${await res.text()}`);
}

/** `YYYY-MM-DD` in local time, the same convention as `episodes.day`. */
function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Search paginates at 100 and caps at 1.000 results per query, so callers slice by date. */
async function searchAll<T>(kind: "commits" | "issues", q: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 10; page++) {
    const url = `/search/${kind}?q=${encodeURIComponent(q)}&per_page=100&page=${page}`;
    const body = await get<{ items: T[]; total_count: number }>(url);
    out.push(...body.items);
    if (body.items.length < 100) break;
    // 30 requests a minute is the documented limit; the secondary limiter is
    // stricter than that in practice, so this pause is deliberately generous.
    await sleep(3000);
  }
  return out;
}

/** Straight REST pagination, for the endpoints that are not `/search`. */
async function paged<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 10; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const body = await get<T[]>(`${path}${sep}per_page=100&page=${page}`);
    out.push(...body);
    if (body.length < 100) break;
  }
  return out;
}

/** Runs `n` at a time. Commit detail is the whole cost of this sync. */
async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) {
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

export interface GithubSyncReport {
  commits: number;
  prs: number;
  additions: number;
  deletions: number;
  errors: string[];
}

/**
 * Gonzalo is the other half of Vesta: his commits are read the same way, so
 * "lines a day between the two of us" is one sum. Each author keeps his own
 * `since`, so adding him later backfills his history instead of starting at
 * Javier's last day.
 */
export const TEAM = ["gonzalolopezgarcia"];

export async function syncGithub(
  opts: { since?: string; authors?: string[] } = {},
): Promise<GithubSyncReport> {
  const login = env.GITHUB_LOGIN;
  if (!login) throw new Error("GITHUB_LOGIN missing");
  const total: GithubSyncReport = { commits: 0, prs: 0, additions: 0, deletions: 0, errors: [] };
  for (const author of opts.authors ?? [login, ...TEAM]) {
    const r = await syncAuthor(author, opts.since ?? (await defaultSince(author)));
    total.commits += r.commits;
    total.prs += r.prs;
    total.additions += r.additions;
    total.deletions += r.deletions;
    total.errors.push(...r.errors.map((e) => `${author}: ${e}`));
  }
  return total;
}

async function syncAuthor(login: string, since: string): Promise<GithubSyncReport> {
  const errors: string[] = [];

  // — commits ————————————————————————————————————————————————
  // 🚨 One query per month, searched AND WRITTEN before the next. Two reasons:
  // search caps at 1.000 results however you paginate (the first full pass
  // silently returned exactly 1.000 of 3.643 commits — no error, three quarters
  // of the year just missing), and a rate limit halfway through must not throw
  // away the months already fetched.
  let additions = 0;
  let deletions = 0;
  let stored = 0;
  const seen = new Set<string>();
  const forks = new Map<string, boolean>();

  for (const [from, to] of months(since)) {
    const found = await searchAll<SearchCommit>(
      "commits",
      `author:${login} author-date:${from}..${to}`,
    );
    // 🚨 Dedupe on the SHA ALONE, not on `repo@sha`. A fork carries the same
    // commit under a different `full_name`, and three of these repos are forks
    // of each other: the first pass stored 918 rows for 395 real commits and
    // reported 2,3× the lines actually written. The row id is `commit:<sha>`
    // for the same reason — the database refuses the duplicate even if this
    // filter ever misses one.
    const bySha = new Map<string, SearchCommit[]>();
    for (const c of found) {
      if (seen.has(c.sha)) continue;
      bySha.set(c.sha, [...(bySha.get(c.sha) ?? []), c]);
    }
    const commits: SearchCommit[] = [];
    for (const [sha, candidates] of bySha) {
      seen.add(sha);
      commits.push(await pickOrigin(candidates, forks));
    }

    // Four at a time, not eight: the secondary limiter counts concurrency.
    await pool(commits, 4, async (c) => {
      const date = c.commit.author?.date;
      if (!date) return;
      try {
        const files = await commitFiles(c.repository.full_name, c.sha);
        if (files === null) return;
        const { additions: add, deletions: del, changedFiles } = handWritten(files);
        additions += add;
        deletions += del;
        stored += 1;
        await db
          .insert(codeRecords)
          .values({
            id: `commit:${c.sha}`,
            kind: "commit",
            repo: c.repository.full_name,
            externalId: c.sha,
            title: c.commit.message.split("\n")[0] ?? null,
            at: new Date(date),
            day: localDay(date),
            additions: add,
            deletions: del,
            changedFiles,
            merged: null,
            url: `https://github.com/${c.repository.full_name}/commit/${c.sha}`,
            author: login,
            raw: { search: c, files: files.length },
          })
          .onConflictDoUpdate({
            target: [codeRecords.userId, codeRecords.id],
            set: { additions: add, deletions: del, changedFiles, fetchedAt: new Date() },
          });
      } catch (e) {
        errors.push(`${c.repository.full_name}@${c.sha.slice(0, 7)}: ${String(e)}`);
      }
    });
  }

  // — pull requests ——————————————————————————————————————————
  // 🚨 A PR DOES carry its own line counts, but not the ones you want: the
  // `/pulls/{n}` object reports the raw diff, and PR #701 of Vesta is +123.010
  // that way against ~2.000 hand-written lines. So the PR's files are walked
  // through the SAME `isGenerated` filter the commits use — otherwise the two
  // numbers on one card would be in different currencies.
  //
  // These lines are still never added to the day's total. A merged PR's diff
  // is the same lines its commits already reported; the number lives on the PR
  // pill so you can see how big that one PR was.
  const prs = await searchAll<SearchPr>("issues", `is:pr author:${login} created:>=${since}`);
  for (const p of prs) {
    const repo = p.repository_url.replace(`${API}/repos/`, "");
    let prAdd: number | null = null;
    let prDel: number | null = null;
    let prFiles: number | null = null;
    try {
      const kept = handWritten(await paged<PrFile>(`/repos/${repo}/pulls/${p.number}/files`));
      prAdd = kept.additions;
      prDel = kept.deletions;
      prFiles = kept.changedFiles;
    } catch (e) {
      errors.push(`pr ${repo}#${p.number}: ${String(e)}`);
    }
    await db
      .insert(codeRecords)
      .values({
        id: `pr:${repo}#${p.number}`,
        kind: "pr",
        repo,
        externalId: String(p.number),
        title: p.title,
        at: new Date(p.created_at),
        day: localDay(p.created_at),
        additions: prAdd,
        deletions: prDel,
        changedFiles: prFiles,
        merged: p.pull_request?.merged_at != null,
        url: p.html_url,
        author: login,
        raw: p,
      })
      .onConflictDoUpdate({
        target: [codeRecords.userId, codeRecords.id],
        set: {
          additions: prAdd,
          deletions: prDel,
          changedFiles: prFiles,
          merged: p.pull_request?.merged_at != null,
          fetchedAt: new Date(),
        },
      });
  }

  return { commits: stored, prs: prs.length, additions, deletions, errors };
}

/**
 * Which repo a shared commit is filed under: the one that is not a fork. It
 * decides only the label on the card — the lines are the same either way — but
 * filing Vesta's commits under a fork of it would make the day's repo
 * breakdown say the wrong thing. Fork status is fetched once per repo.
 */
async function pickOrigin(
  candidates: SearchCommit[],
  forks: Map<string, boolean>,
): Promise<SearchCommit> {
  if (candidates.length === 1) return candidates[0]!;
  for (const c of candidates) {
    const name = c.repository.full_name;
    if (!forks.has(name)) {
      try {
        const meta = await get<{ fork: boolean }>(`/repos/${name}`);
        forks.set(name, meta.fork);
      } catch {
        forks.set(name, false);
      }
    }
  }
  return candidates.find((c) => forks.get(c.repository.full_name) === false) ?? candidates[0]!;
}

/** `[from, to]` per calendar month from `since` to today, inclusive. */
function months(since: string): [string, string][] {
  const out: [string, string][] = [];
  const end = new Date();
  const cursor = new Date(`${since}T00:00:00`);
  while (cursor <= end) {
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    out.push([iso(cursor), iso(last < end ? last : end)]);
    cursor.setFullYear(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return out;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The day after the newest row we hold, so a re-run is cheap. `>=` rather than
 * `>` because the newest day is usually still in progress.
 */
async function defaultSince(author: string): Promise<string> {
  const [row] = await db
    .select({ day: sql<string | null>`max(${codeRecords.day})` })
    .from(codeRecords)
    .where(eq(codeRecords.author, author));
  return row?.day ?? "2025-10-30";
}
