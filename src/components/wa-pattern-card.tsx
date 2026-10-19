import Link from "next/link";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { BAND_LABEL } from "~/lib/wa-pattern";
import type { WaPattern } from "~/server/queries/whatsapp";

/**
 * What his WhatsApp is for on this screen: whether a tense day shows in the
 * next morning's recovery, and which topics come tense. No conversation is named.
 */
/** `topics` off where «De qué hablas» already says it (`?ver=conversaciones`). */
export function WaPatternCard({ pattern, link = false, topics = true }: { pattern: WaPattern; link?: boolean; topics?: boolean }) {
  return (
    <Card className="p-4 animate-row-in motion-reduce:animate-none">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-gray-900">Tus conversaciones y tu recuperación</h3>
        {link ? (
          <Button asChild size="toolbar" variant="outline" className="-my-1">
            <Link href="/?ver=conversaciones">Ver todo</Link>
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-sm leading-5 text-gray-700">{pattern.headline}</p>
      {pattern.paired > 0 ? (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500">
              <th className="pb-1 text-left font-medium">Día en WhatsApp</th>
              <th className="pb-1 text-right font-medium">Días</th>
              <th className="pb-1 text-right font-medium">Recuperación</th>
              <th className="pb-1 text-right font-medium">HRV</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pattern.rows.map((r) => (
              <tr key={r.band} className="tabular-nums text-gray-900">
                <td className="py-1.5">{BAND_LABEL[r.band]}</td>
                <td className="py-1.5 text-right text-gray-500">{r.days}</td>
                <td className="py-1.5 text-right">{r.recovery === null ? "·" : `${r.recovery} %`}</td>
                <td className="py-1.5 text-right">{r.hrv === null ? "·" : `${r.hrv} ms`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p className="mt-2 text-xs text-gray-500">De WHOOP, a la mañana siguiente de cada día leído.</p>

      {topics ? (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium text-gray-900">Qué temas te tensan</h3>
            <span className="text-xs text-gray-500">12 semanas</span>
          </div>
          {pattern.topics.length === 0 ? (
            <p className="mt-1 text-sm text-gray-500">Aún pocas conversaciones con tema: cada día leído suma.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {pattern.topics.map((t, i) => (
                <li key={t.topic} className="flex items-center gap-3 text-sm">
                  <span className="w-16 shrink-0 text-gray-900">{t.topic}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <span className="block h-full rounded-full bg-amber-500" style={{ width: `${t.tense}%` }} />
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-gray-500">
                    {t.tense} %{i === 0 ? " tensas" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </Card>
  );
}
