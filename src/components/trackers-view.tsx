import { Card } from "~/components/ui/card";
import { amount } from "~/lib/food";
import { dayTitle, localDay } from "~/lib/day";
import { cn } from "~/lib/utils";
import { DEFAULT_CATEGORIES, MOOD, type MoodDay, type TrackedCategory } from "~/lib/trackers";

/**
 * «Lo que apuntas»: every category with what is in it, the last 30 days.
 * Ánimo first, as a chart (Javier, 19-oct-2026: «varias veces al día… y así
 * ver gráficos»), then Síntomas, even empty: they are asked every night. His
 * own categories come from the chat, and he rearranges them by talking («pon
 * la sauna en Descanso»): nothing to edit here.
 */
export function TrackersView({ tracked, moods }: { tracked: TrackedCategory[]; moods: MoodDay[] }) {
  const today = localDay(new Date());
  const fixed = DEFAULT_CATEGORIES.map(
    (name) => tracked.find((c) => c.category.toLowerCase() === name.toLowerCase()) ?? { category: name, own: false, times: 0, types: [] },
  );
  const cards = [...fixed, ...tracked.filter((c) => !fixed.includes(c))].filter((c) => c.category !== MOOD);
  return (
    <div className="space-y-3">
      <MoodChart moods={moods} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <Card key={c.category} className="p-4">
            <div className="flex items-baseline gap-2 px-2">
              <h3 className="text-sm font-medium text-gray-900">{c.category}</h3>
              {c.times > 0 ? <span className="text-xs text-gray-500 tabular-nums">{c.times}</span> : null}
            </div>
            {c.types.length === 0 ? <p className="px-2 py-1.5 text-sm text-gray-500">Te lo pregunto cada noche.</p> : null}
            <ul className="mt-1">
              {c.types.map((t) => (
                <li key={t.name} className="flex items-baseline gap-3 px-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate text-gray-900">{t.name}</span>
                  <span className="shrink-0 text-xs text-gray-500 tabular-nums">
                    {t.times === 1 ? "1 vez" : `${t.times} veces`} · {dayTitle(t.last, today)}
                    {t.lastValue ? ` · ${t.lastValue}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <p className="px-2 text-xs text-gray-500">Últimos 30 días. Se ordena hablando: «pon la sauna en Descanso».</p>
    </div>
  );
}

/** A dot per time he said it (amber at 4 or less), over a gray bar for how his chats read that day. */
function MoodChart({ moods }: { moods: MoodDay[] }) {
  const said = moods.flatMap((d) => d.said);
  const last = said.at(-1);
  return (
    <Card className="p-4">
      <div className="flex items-baseline gap-2 px-2">
        <h3 className="text-sm font-medium text-gray-900">{MOOD}</h3>
        {last !== undefined ? <span className="text-xs text-gray-500 tabular-nums">último {amount(last)}/10</span> : null}
      </div>
      <div className="mt-3 flex h-24 items-stretch gap-0.5 px-2">
        {moods.map((d) => (
          <div key={d.day} className="relative flex-1" title={`${d.day}: ${d.said.map(amount).join(", ") || "sin apuntar"}`}>
            {d.chats !== null ? (
              <span className="absolute inset-x-0 bottom-0 rounded-sm bg-gray-200" style={{ height: `${d.chats * 10}%` }} />
            ) : null}
            {d.said.map((v, i) => (
              <span
                key={i}
                className={cn("absolute left-1/2 h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-full", v <= 4 ? "bg-amber-500" : "bg-gray-800")}
                style={{ bottom: `${v * 10}%` }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between px-2 text-[10px] text-gray-400">
        <span>hace 30 días</span>
        <span className="flex items-center gap-2.5">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-gray-800" />
            Tú
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-gray-200" />
            Tus chats
          </span>
        </span>
        <span>hoy</span>
      </div>
    </Card>
  );
}
