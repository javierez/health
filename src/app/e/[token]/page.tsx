import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Logo } from "~/components/logo";
import { WorkoutPage } from "~/components/training/workout-page";
import { asOwner } from "~/db";
import { loadTraining, loadWorkout } from "~/server/queries/training";
import { dayOf } from "~/server/training/link";

export const metadata: Metadata = { title: "Entreno · Pulso", robots: { index: false, follow: false } };

/**
 * One session, open without his login (`src/proxy.ts`): the link the chat
 * sends when he is done (`~/server/training/done`). The token is the day and
 * its signature (`~/server/training/link`): a made-up one is a 404.
 */
export default async function SessionPage({ params }: { params: Promise<{ token: string }> }) {
  const day = dayOf((await params).token);
  if (!day) notFound();
  // Nobody is signed in here: his data, read as his.
  const [view, training] = await asOwner(() => Promise.all([loadWorkout(day), loadTraining()]));
  if (!view) notFound();
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-4 flex items-center">
        <Logo className="text-xl" />
      </header>
      <WorkoutPage view={view} lifts={training.lifts} />
    </main>
  );
}
