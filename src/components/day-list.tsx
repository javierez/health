import type { DayRows } from "~/server/queries/salud";

/** Days, newest first; one line per thing: time, what, detail. */
export function Days({ days, empty }: { days: DayRows[]; empty: string }) {
  if (days.length === 0) return <p className="py-8 text-center text-sm text-gray-500">{empty}</p>;
  return (
    <div className="space-y-5">
      {days.map((d, i) => (
        <section
          key={d.day}
          className="animate-row-in motion-reduce:animate-none"
          style={{ animationDelay: `${Math.min(i, 6) * 0.08}s` }}
        >
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">{d.title}</h2>
          <ul className="divide-y divide-gray-100">
            {d.rows.map((r, i) => (
              <li key={i} className="flex gap-3 py-2 text-sm">
                <span className="w-11 shrink-0 tabular-nums text-gray-400">{r.time}</span>
                <span className="shrink-0 font-medium">{r.label}</span>
                <span className="min-w-0 text-gray-600">{r.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
