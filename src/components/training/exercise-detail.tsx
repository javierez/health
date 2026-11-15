import type { ReactNode } from "react";

import { dayLabel } from "~/components/balance-card";
import { exerciseOf, ZONE_LABEL, type Zone } from "~/lib/exercises";
import { movedOf } from "~/lib/workout";
import { cn } from "~/lib/utils";
import type { SessionLine } from "~/server/training/summary";
import { Move } from "./move";

const kg = (n: number) => `${Number(n.toFixed(1)).toLocaleString("es-ES")} kg`;

/**
 * One exercise of one session, on a tap (Javier, 15-nov-2026: «modal with the
 * reps and all»): its drawing moving, how it is done, each set with its kilos
 * and reps, what else he did of it and what it works.
 */
export function ExerciseDetail({ line, other }: { line: SessionLine; other: { day: string; sets: string }[] }) {
  const reps = line.detail.reduce((n, s) => n + (s.reps ?? 0), 0);
  const secs = line.detail.reduce((n, s) => n + (s.seconds ?? 0), 0);
  const moved = movedOf(line);
  const top = Math.max(0, ...line.detail.map((s) => s.kg ?? 0));
  const work = (line.move?.work ?? exerciseOf(line.name)?.work ?? {}) as Partial<Record<Zone, number>>;
  const muscles = (Object.entries(work) as [Zone, number][]).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-4">
      {line.move?.drawn ? (
        <div className="flex justify-center rounded-xl bg-gradient-to-b from-gray-50 to-white py-3">
          <Move move={line.move} size={260} />
        </div>
      ) : null}
      {line.move?.how ? <p className="text-sm text-gray-600">{line.move.how}</p> : null}

      {line.detail.length > 0 ? (
        <>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Tile label="Series" value={String(line.detail.length)} />
            <Tile label={secs && !reps ? "Tiempo" : "Reps"} value={secs && !reps ? `${secs} s` : reps ? String(reps) : "?"} />
            <Tile label={moved ? "Movido" : "Peso máx"} value={moved ? kg(moved) : top ? kg(top) : "–"} />
          </dl>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400">
                <th className="pb-1 font-normal">Serie</th>
                <th className="pb-1 font-normal">Peso</th>
                <th className="pb-1 font-normal">Reps</th>
                <th className="pb-1 text-right font-normal">Volumen</th>
              </tr>
            </thead>
            <tbody>
              {line.detail.map((s, i) => (
                <tr key={i} className="border-t border-gray-100 tabular-nums">
                  <td className="py-2 text-gray-500">{i + 1}</td>
                  <td className="py-2 text-gray-900">
                    {s.kg ? `${kg(s.kg)}${line.perHand ? " cada mano" : ""}` : <span className="text-gray-400">sin peso</span>}
                  </td>
                  <td className="py-2 text-gray-900">{s.reps ? `${s.reps} reps` : s.seconds ? `${s.seconds} s` : <span className="text-amber-700">sin apuntar</span>}</td>
                  <td className="py-2 text-right text-gray-500">{s.kg && s.reps ? kg(s.kg * s.reps * (line.perHand ? 2 : 1)) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {line.detail.some((s) => !s.reps && !s.seconds) ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Faltan las reps: díselas al chat y se apuntan.</p>
          ) : null}
        </>
      ) : line.text ? (
        <p className="text-sm text-gray-900 tabular-nums">{line.text}</p>
      ) : null}

      <div>
        <h3 className="text-sm font-medium text-gray-900">Otras veces</h3>
        {other.length > 0 ? (
          <ul className="mt-1 divide-y divide-gray-100">
            {other.map((o) => (
              <li key={o.day} className="flex items-baseline gap-3 py-1.5 text-sm">
                <span className="w-14 shrink-0 text-gray-500">{dayLabel(o.day)}</span>
                <span className="text-gray-900 tabular-nums">{o.sets}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-gray-500">Es la primera vez que lo apuntas.</p>
        )}
      </div>

      {muscles.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium text-gray-900">Qué trabaja</h3>
          <ul className="mt-2 space-y-1.5">
            {muscles.map(([zone, w]) => (
              <li key={zone} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 text-gray-600">{ZONE_LABEL[zone]}</span>
                <span className="h-1.5 flex-1 rounded-full bg-gray-100">
                  <span className={cn("block h-1.5 rounded-full", w >= 1 ? "bg-gray-900" : "bg-gray-400")} style={{ width: `${Math.min(100, w * 100)}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function Tile({ label, value, tone }: { label: string; value: ReactNode; tone?: "amber" }) {
  return (
    <div className={cn("rounded-xl py-2", tone === "amber" ? "bg-amber-50" : "bg-gray-50")}>
      <dt className={cn("text-[11px]", tone === "amber" ? "text-amber-800" : "text-gray-500")}>{label}</dt>
      <dd className={cn("flex items-center justify-center gap-1 font-semibold tabular-nums", tone === "amber" ? "text-amber-800" : "text-gray-900")}>{value}</dd>
    </div>
  );
}
