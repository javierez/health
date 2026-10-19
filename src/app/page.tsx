import Link from "next/link";
import { after } from "next/server";
import { Suspense } from "react";
import { LayoutGrid, MessageCircle } from "lucide-react";

import { Account } from "~/components/account";
import { BoardSkeleton } from "~/components/board-skeleton";
import { Chat } from "~/components/chat/chat";
import { ConversationsView } from "~/components/conversations-view";
import { Logo } from "~/components/logo";
import { Effects } from "~/components/effects";
import { FindingsCard } from "~/components/findings-card";
import { FoodCard } from "~/components/food-card";
import { TodayCard } from "~/components/today-card";
import { PanelVoice } from "~/components/panel-voice";
import { ProductsCard } from "~/components/products-card";
import { TrainingCard } from "~/components/training/training-card";
import { TrainingView } from "~/components/training/training-view";
import { Stats } from "~/components/stats";
import { Button } from "~/components/ui/button";
import { UrgentCard } from "~/components/urgent-card";
import { WeekCard } from "~/components/week-card";
import { env } from "~/env";
import { localDay } from "~/lib/day";
import { loadChat } from "~/server/queries/chat";
import { loadConversations } from "~/server/queries/conversations";
import { loadCommitments } from "~/server/queries/commitments";
import { loadExperiments } from "~/server/queries/experiments";
import { loadFindings } from "~/server/queries/findings";
import { loadFood } from "~/server/queries/food";
import { loadProgress } from "~/server/queries/progress";
import { loadSalud } from "~/server/queries/salud";
import { loadProducts } from "~/server/queries/products";
import { loadToday } from "~/server/queries/today";
import { loadTraining } from "~/server/queries/training";
import { loadMoods, loadTrackers } from "~/server/queries/trackers";
import { olderThan, syncEverything } from "~/server/sync-all";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * What matters first, and nothing that moves under the mouse: what cannot
 * wait (the medical pending), what is left today with what to do and avoid,
 * the week's commitments, and what does him good or harm. Titles only: the
 * detail opens on a click, and every number lives in «Datos». «Hablar» is
 * the chat by voice.
 */
async function Panel() {
  const [today, commitments, progress, data, findings, products, food, tracked, training, moods] = await Promise.all([
    loadToday(),
    loadCommitments(),
    loadProgress(),
    loadSalud(),
    loadFindings(),
    loadProducts(),
    loadFood(),
    loadTrackers(),
    loadTraining(),
    loadMoods(),
  ]);
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-2 animate-rise motion-reduce:animate-none">
        <div className="mr-auto flex min-w-0 basis-full items-baseline gap-3 sm:basis-auto sm:flex-1">
          <h1 className="text-2xl sm:text-3xl"><Logo /></h1>
          <span className="truncate text-sm text-gray-500 first-letter:uppercase">{today.date}</span>
        </div>
        <PanelVoice />
        <Stats progress={progress} data={data} tracked={tracked} moods={moods} />
        <Button asChild size="pill" variant="outline">
          <Link href="/">
            <MessageCircle />
            Chat
          </Link>
        </Button>
        <Account />
      </header>
      <UrgentCard today={today} medical={data.medical} heard={data.heard} style={{ animationDelay: "0.08s" }} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-5">
        {/* Left, what is done today (to do, food, skin); right, the week and training. On a phone one list, «Piel» last. */}
        <div className="contents lg:col-span-3 lg:block lg:space-y-4">
          <TodayCard today={today} style={{ animationDelay: "0.16s" }} />
          <FoodCard
            food={food}
            supplements={products.filter((p) => p.area === "suplemento")}
            list={commitments}
            today={localDay(new Date())}
            style={{ animationDelay: "0.28s" }}
          />
          <div className="order-last lg:order-none">
            <ProductsCard products={products.filter((p) => p.area === "piel")} list={commitments} today={localDay(new Date())} style={{ animationDelay: "0.32s" }} />
          </div>
        </div>
        <div className="contents lg:col-span-2 lg:block lg:space-y-4">
          <WeekCard list={commitments} today={localDay(new Date())} style={{ animationDelay: "0.24s" }} />
          <TrainingCard training={training} today={localDay(new Date())} style={{ animationDelay: "0.26s" }} />
        </div>
      </div>
      <FindingsCard findings={findings} style={{ animationDelay: "0.36s" }} />
    </div>
  );
}

/**
 * Home is the chat: everything he can do, he can ask for, typed or spoken.
 * The board is one tap away, at `?ver=panel`, and how things affect him at
 * `?ver=efectos`, his trainings at `?ver=entrenos`, his conversations at
 * `?ver=conversaciones` (same route: no new
 * entry in the routing table).
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ ver?: string | string[] }> }) {
  // Opening the app is the freshest signal there is: if the last pass is
  // older than ten minutes, pull everything after the page is sent. Only in
  // production: a laptop that refreshes the WHOOP token kills production's.
  if (env.NODE_ENV === "production") {
    after(async () => {
      if (await olderThan("pocket", 10)) await syncEverything();
    });
  }

  const ver = (await searchParams).ver;
  if (ver === "efectos") {
    const [findings, experiments] = await Promise.all([loadFindings(), loadExperiments()]);
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Effects findings={findings} experiments={experiments} />
      </main>
    );
  }
  if (ver === "conversaciones") {
    const [data, findings] = await Promise.all([loadConversations(), loadFindings()]);
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <ConversationsView data={data} findings={findings} />
      </main>
    );
  }
  if (ver === "entrenos") {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <TrainingView training={await loadTraining()} today={localDay(new Date())} />
      </main>
    );
  }
  if (ver === "panel") {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Suspense fallback={<BoardSkeleton />}>
          <Panel />
        </Suspense>
      </main>
    );
  }

  const lines = await loadChat();
  return (
    <main className="flex h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 pt-6 pb-2 sm:px-6 sm:pt-8">
        <h1 className="text-2xl sm:text-3xl"><Logo /></h1>
        <Button asChild size="pill" variant="outline">
          <Link href="/?ver=panel">
            <LayoutGrid />
            Panel
          </Link>
        </Button>
      </header>
      <Chat initial={lines} />
    </main>
  );
}
