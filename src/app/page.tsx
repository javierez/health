import { Suspense } from "react";

import { Board } from "~/components/board";
import { BoardSkeleton } from "~/components/board-skeleton";
import { countByCategory, listActivities, listRecordings } from "~/server/queries/recordings";
import { readSyncState } from "~/server/queries/sync-state";
import { listWhoopDays } from "~/server/queries/whoop";
import { listCodeDays } from "~/server/queries/code";

export const dynamic = "force-dynamic";

async function Content() {
  // Six round trips in parallel — none of them depends on another.
  const [recordings, activities, counts, sync, whoop, code] = await Promise.all([
    listRecordings(),
    listActivities(),
    countByCategory(),
    readSyncState("pocket"),
    listWhoopDays(),
    listCodeDays(),
  ]);

  return (
    <Board
      recordings={recordings.map((r) => ({
        ...r,
        recordedAt: r.recordedAt?.toISOString() ?? null,
      }))}
      activities={activities}
      whoop={whoop}
      code={code}
      counts={counts}
      lastSweptAt={sync?.lastSweptAt?.toISOString() ?? null}
    />
  );
}

export default function HomePage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <Suspense fallback={<BoardSkeleton />}>
        <Content />
      </Suspense>
    </main>
  );
}
