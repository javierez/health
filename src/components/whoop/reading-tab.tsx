import { dayTitle } from "~/lib/day";
import type { Reading } from "~/server/queries/reading";
import { Empty, Panel } from "./parts";

const rise = (i: number) => ({ animationDelay: `${i * 0.08}s` });

/**
 * The interpreter's weekly reading of everything (`insights/interpret.ts`):
 * what his data says in two lines, then what to do, most first. Each detail
 * carries its number and how sure it is.
 */
export function ReadingTab({ reading, today }: { reading: Reading | null; today: string }) {
  if (!reading) return <Panel><Empty>Tus datos se leen una vez por semana: la primera lectura llega con la próxima sincronización.</Empty></Panel>;
  return (
    <div className="space-y-3">
      <Panel title="Lo que dicen tus datos" right={<span className="text-[10px] text-gray-400 first-letter:uppercase">{dayTitle(reading.day, today)}</span>}>
        <p className="text-sm leading-relaxed text-gray-800">{reading.summary}</p>
      </Panel>
      <Panel title="Qué hacer">
        <ol className="space-y-3">
          {reading.items.map((r, i) => (
            <li key={r.title} className="flex gap-3 animate-rise motion-reduce:animate-none" style={rise(i)}>
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[10px] font-semibold text-white tabular-nums">{i + 1}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{r.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{r.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
