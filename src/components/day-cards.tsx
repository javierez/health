import { ChevronDown } from "lucide-react";

import { Card } from "~/components/ui/card";
import { GROUP_LABEL, type GroupKey } from "~/lib/day-groups";
import type { DayCard, Group } from "~/server/queries/salud";

/**
 * One card a day, newest first. Each group is one line that says it all;
 * tap it for the detail. With a filter on, only that group, already open.
 */
export function DayCards({ days, only }: { days: DayCard[]; only: GroupKey | null }) {
  return (
    <div className="space-y-3">
      {days.map((d, i) => (
        <Card
          key={d.day}
          className="p-4 animate-row-in motion-reduce:animate-none"
          style={{ animationDelay: `${Math.min(i, 6) * 0.08}s` }}
        >
          <header className="mb-1 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-900">{d.title}</h3>
            {d.weight ? <span className="text-xs tabular-nums text-gray-500">{d.weight}</span> : null}
          </header>
          <div className="divide-y divide-gray-100">
            {d.groups
              .filter((g) => only === null || g.key === only)
              .map((g) => (
                <GroupRow key={g.key} group={g} open={only !== null} />
              ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function GroupRow({ group, open }: { group: Group; open: boolean }) {
  const label = <span className="w-20 shrink-0 text-xs font-medium leading-5 text-gray-500">{GROUP_LABEL[group.key]}</span>;
  const summary = <span className="min-w-0 flex-1 text-sm leading-5 text-gray-900">{group.summary}</span>;
  // Nothing underneath (WhatsApp is always so): a line, not a fold.
  if (group.rows.length === 0) {
    return (
      <div className="flex items-start gap-3 py-2.5 pr-7">
        {label}
        {summary}
      </div>
    );
  }
  return (
    <details open={open} className="group py-2.5">
      <summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
        {label}
        {summary}
        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="mt-2 space-y-2 sm:pl-[5.75rem]">
        {group.rows.map((r, i) => (
          <li key={i} className="flex gap-3 text-sm leading-5">
            {r.time ? <span className="w-11 shrink-0 tabular-nums text-gray-400">{r.time}</span> : null}
            <p className="min-w-0">
              <span className="font-medium text-gray-900">{r.label}</span> <span className="text-gray-600">{r.text}</span>
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}
