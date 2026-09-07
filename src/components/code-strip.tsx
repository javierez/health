import { GitCommitHorizontal, GitPullRequest } from "lucide-react";

import { cn } from "~/lib/utils";
import type { CodeDay } from "~/server/queries/code";

/**
 * What shipped that day: commits, the diff, and the PRs.
 *
 * 🚨 `+/−` is the diff of the day's COMMITS, and the PR count sits beside it
 * rather than adding to it — see `listCodeDays`, where the same reasoning stops
 * a merged PR being counted twice. So "3 PR" here never means "3 more diffs".
 */
const nf = new Intl.NumberFormat("es-ES");

export function CodeStrip({ code, className }: { code: CodeDay; className?: string }) {
  if (code.commits === 0 && code.prs === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs", className)}>
      {code.commits > 0 ? (
        <span className="flex items-center gap-1 text-gray-600">
          <GitCommitHorizontal className="h-3.5 w-3.5" />
          <span className="tabular-nums">{code.commits}</span> commit
          {code.commits === 1 ? "" : "s"}
        </span>
      ) : null}
      {code.additions + code.deletions > 0 ? (
        <span className="tabular-nums text-gray-500">
          <span className="text-amber-700">+{nf.format(code.additions)}</span>{" "}
          <span className="text-gray-400">−{nf.format(code.deletions)}</span>
        </span>
      ) : null}
      {code.prs > 0 ? (
        <span className="flex items-center gap-1 text-gray-600">
          <GitPullRequest className="h-3.5 w-3.5" />
          <span className="tabular-nums">{code.prs}</span> PR
          {code.prsMerged > 0 && code.prsMerged < code.prs ? (
            <span className="text-gray-400">({code.prsMerged} fusionad{code.prsMerged === 1 ? "a" : "as"})</span>
          ) : null}
        </span>
      ) : null}
      {code.repos[0] ? <span className="text-gray-400">{code.repos[0].repo.split("/")[1]}</span> : null}
    </div>
  );
}

/** The PRs themselves, listed under the rail when a day is open. */
export function CodePullRequests({ code }: { code: CodeDay }) {
  if (code.pullRequests.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {code.pullRequests.map((p) => (
        <a
          key={`${p.repo}#${p.number}`}
          href={p.url ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="flex max-w-full items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 transition-colors hover:bg-gray-200"
        >
          <GitPullRequest
            className={cn("h-3 w-3", p.merged ? "text-amber-600" : "text-gray-400")}
          />
          <span className="tabular-nums text-gray-400">#{p.number}</span>
          <span className="truncate">{p.title ?? p.repo}</span>
          {/* The PR's own diff, which is NOT added to the day's `+/−`: it is
              the same lines its commits already reported. */}
          {p.additions !== null ? (
            <span className="shrink-0 tabular-nums text-gray-400">
              +{nf.format(p.additions)} −{nf.format(p.deletions ?? 0)}
            </span>
          ) : null}
        </a>
      ))}
    </div>
  );
}
