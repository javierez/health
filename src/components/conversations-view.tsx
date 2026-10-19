import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ConversationEffects } from "~/components/conversation-effects";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { type Conversations } from "~/lib/conversations";
import { isConversation } from "~/server/insights/candidates";
import type { Findings } from "~/server/insights/findings";
import { OUTCOME_KEYS } from "~/server/insights/outcomes";

const rise = (i: number) => ({ animationDelay: `${i * 0.08}s` });

/**
 * «Conversaciones» (Javier, 18-oct-2026: «el tone me gusta… y conversaciones
 * screen»): whether his conversations show in his body, which topics come
 * tense and with whom. What he can act on, not the past day by day («lo que
 * pueda hacer a continuación más que el pasado»).
 */
export function ConversationsView({ data, findings }: { data: Conversations; findings: Findings }) {
  // His body only: his code is not what this screen asks about.
  const mine = OUTCOME_KEYS.filter((o) => o !== "nextLines")
    .flatMap((o) => Object.values(findings.by[o]).flat())
    .filter((f) => isConversation(f.key));
  const topics = [...data.topics].sort((a, b) => b.tense / b.talks - a.tense / a.talks);
  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3 animate-rise motion-reduce:animate-none">
        <div className="mr-auto flex min-w-0 items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Conversaciones</h1>
          <span className="truncate text-sm text-gray-500">{data.total} en 8 semanas</span>
        </div>
        <Button asChild size="pill" variant="outline">
          <Link href="/?ver=panel">
            <ArrowLeft />
            Panel
          </Link>
        </Button>
      </header>

      {data.total === 0 ? (
        <Card className="p-6 text-center text-sm text-gray-500 animate-rise motion-reduce:animate-none" style={rise(1)}>
          Aún no hay conversaciones leídas.
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <ConversationEffects mine={mine} className="lg:col-span-2" style={rise(1)} />

          <Card className="p-4 animate-rise motion-reduce:animate-none" style={rise(2)}>
            <h2 className="text-sm font-medium text-gray-900">Qué temas te tensan</h2>
            <ul className="mt-3 space-y-1.5">
              {topics.map((t) => (
                <li key={t.topic} className="flex items-center gap-3 text-sm">
                  <span className="w-16 shrink-0 text-gray-900">{t.topic}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <span className="block h-full rounded-full bg-amber-500" style={{ width: `${(t.tense / t.talks) * 100}%` }} />
                  </span>
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums text-gray-500">
                    {t.tense} de {t.talks}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {data.people.length > 0 ? (
            <Card className="p-4 animate-rise motion-reduce:animate-none" style={rise(3)}>
              <h2 className="text-sm font-medium text-gray-900">Con quién</h2>
              <ul className="mt-3 space-y-1.5">
                {data.people.map((p) => (
                  <li key={p.who} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-gray-900">{p.who}</span>
                    <span className="shrink-0 text-xs tabular-nums text-gray-500">
                      {p.tense} de {p.talks} tensas
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
