import { cn } from "~/lib/utils";
import type { Finding } from "~/server/insights/findings";
import { Empty, Panel } from "./parts";

/**
 * WHOOP's Journal Insights, from what health already learns (`insights/findings`):
 * each habit as a bar from the centre, left in amber when it lowers next
 * morning's recovery, right in grey when it raises it; faint when only probable.
 */
export function HabitsTab({ good, bad }: { good: Finding[]; bad: Finding[] }) {
  const all = [...good, ...bad].sort((a, b) => b.points - a.points);
  const top = Math.max(1, ...all.map((f) => Math.abs(f.points)));
  if (all.length === 0) return <Panel><Empty>Aún no hay hábitos con efecto claro en tu recuperación.</Empty></Panel>;
  return (
    <Panel title="Lo que mueve tu recuperación" right={<span className="text-[10px] text-gray-400">puntos al día siguiente</span>}>
      <div className="mb-2 flex justify-between text-[10px] font-semibold uppercase tracking-wider">
        <span className="text-amber-600">Baja</span>
        <span className="text-gray-700">Sube</span>
      </div>
      <ul className="space-y-3">
        {all.map((f) => {
          const w = (Math.abs(f.points) / top) * 50;
          const up = f.points > 0;
          return (
            <li key={f.key}>
              <p className="mb-1 flex justify-between gap-2 text-sm">
                <span className="text-gray-800">{f.title}</span>
                <span className={cn("tabular-nums font-semibold", up ? "text-gray-900" : "text-amber-600")}>{f.big}</span>
              </p>
              <div className="relative h-2 rounded-full bg-gray-50">
                <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-400" />
                <span
                  className={cn("absolute top-0 h-full rounded-full", up ? "bg-gray-800" : "bg-amber-500", !f.sure && "opacity-40")}
                  style={up ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
                />
              </div>
              <p className="mt-0.5 text-[10px] text-gray-400">
                {f.nights} noches{f.sure ? "" : " · probable"}
              </p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
