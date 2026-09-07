import { cn } from "~/lib/utils";
import type { WhoopDay } from "~/server/queries/whoop";
import type { CodeDay } from "~/server/queries/code";

/**
 * WHOOP's three rings, in WHOOP's own order and WHOOP's own colours.
 *
 * 🚨 Separate rings, not concentric. Concentric rings share a centre but not a
 * scale: the inner ring is half the circumference of the outer one, so an 87 %
 * drawn inside looks smaller than a 60 % drawn outside. Three equal rings
 * compare honestly — and it is what the WHOOP app itself does, so the card is
 * already familiar.
 *
 * Order is SUEÑO · RECUPERACIÓN · ESFUERZO because that is the order in the
 * app, and the point of copying it is that no relearning is needed.
 */

/** WHOOP's strain ceiling. Strain is 0–21 and logarithmic, never a percentage. */
const STRAIN_MAX = 21;

/**
 * 🚨 The code ring needs a denominator and GitHub does not supply one — unlike
 * recovery and sleep, "lines written" has no natural 100 %. So this is a
 * TARGET, not a maximum, and it is MEASURED rather than guessed: over the 267
 * days on record the median day is 7.806 lines and the 90th percentile is
 * 31.305. The ring fills at the 90th percentile, so an ordinary day sits about
 * a quarter round and only a genuinely big one closes the circle. The first
 * guess was 2.000, which would have pinned nearly every day at full.
 *
 * Days above it all look the same, which is the honest trade: the ring answers
 * "how big was this day", and the exact number is printed inside it.
 */
const DAILY_LINES_TARGET = 30_000;

/**
 * 🚨 Recovery's colour is BANDED, not a single hue: green ≥ 67, yellow 34–66,
 * red below. That banding is the whole message of the number — a 39 % is not a
 * paler green, it is a yellow day — and drawing it in one colour would throw
 * away the only part of WHOOP's palette that carries meaning.
 */
function recoveryColour(pct: number): string {
  if (pct >= 67) return "text-emerald-500";
  if (pct >= 34) return "text-yellow-400";
  return "text-red-500";
}

interface Gauge {
  key: string;
  label: string;
  /** 0–1, how full the ring is. Null when WHOOP has nothing for the day. */
  fill: number | null;
  value: string;
  /** Rendered smaller, right after the value. */
  suffix?: string;
  klass: string;
}

/** `1.204` → `1,2k`, so four digits still fit inside a 56px ring. */
function short(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1).replace(".", ",")}k`;
}

export function dayGauges(whoop: WhoopDay | null, code: CodeDay | null): Gauge[] {
  return [
    {
      key: "sleep",
      label: "Sueño",
      fill: whoop?.sleepScore == null ? null : whoop.sleepScore / 100,
      value: whoop?.sleepScore == null ? "—" : `${Math.round(whoop.sleepScore)}`,
      suffix: whoop?.sleepScore == null ? undefined : "%",
      klass: "text-sky-300",
    },
    {
      key: "recovery",
      label: "Recuperación",
      fill: whoop?.recovery == null ? null : whoop.recovery / 100,
      value: whoop?.recovery == null ? "—" : `${Math.round(whoop.recovery)}`,
      suffix: whoop?.recovery == null ? undefined : "%",
      klass: whoop?.recovery == null ? "text-gray-300" : recoveryColour(whoop.recovery),
    },
    {
      key: "strain",
      label: "Esfuerzo",
      fill: whoop?.strain == null ? null : whoop.strain / STRAIN_MAX,
      value: whoop?.strain == null ? "—" : whoop.strain.toFixed(1).replace(".", ","),
      klass: "text-blue-500",
    },
    {
      key: "code",
      label: "Código",
      fill: code == null ? null : code.additions / DAILY_LINES_TARGET,
      value: code == null ? "—" : short(code.additions),
      klass: "text-amber-500",
    },
  ];
}

/** One ring with its number inside. */
export function Ring({
  fill,
  value,
  suffix,
  klass,
  size = 56,
}: {
  fill: number | null;
  value: string;
  suffix?: string;
  klass: string;
  size?: number;
}) {
  const r = 26;
  const c = 2 * Math.PI * r;
  // Capped at full: a 15 % over-target must not wrap round and read as 15 %.
  const filled = Math.min(fill ?? 0, 1) * c;

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-gray-100" />
        {fill === null ? null : (
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${c - filled}`}
            className={cn("stroke-current", klass)}
          />
        )}
      </svg>
      {/* Centred by the flex box, not by a padding guess: the value and its
          `%` are different sizes, so the baseline trick that lined up one of
          them pushed the other off-centre. */}
      <span className="absolute inset-0 flex items-center justify-center">
        <span
          className={cn(
            "flex items-baseline text-sm font-semibold leading-none tabular-nums",
            fill === null ? "text-gray-300" : "text-gray-900",
          )}
        >
          {value}
          {suffix ? <span className="text-[9px] font-medium">{suffix}</span> : null}
        </span>
      </span>
    </span>
  );
}

/**
 * The day's four rings, labelled underneath. Three are WHOOP's; the fourth is
 * the day's hand-written lines, on the same footing because it is the same
 * kind of question — how much did this day have in it.
 *
 * The day's three rings, labelled underneath. This REPLACES the line of text
 * that used to read "87% recuperación · 6h 59m de sueño · 76% · 5.3 de
 * esfuerzo" — the same facts, legible without being read.
 */
export function DayGauges({
  whoop,
  code,
  className,
}: {
  whoop: WhoopDay | null;
  code: CodeDay | null;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-5", className)}>
      {dayGauges(whoop, code).map((g) => (
        <div key={g.key} className="flex w-[76px] flex-col items-center gap-1">
          <Ring fill={g.fill} value={g.value} suffix={g.suffix} klass={g.klass} />
          <p className="text-[10px] font-medium uppercase leading-tight tracking-wide text-gray-500">
            {g.label}
          </p>
        </div>
      ))}
    </div>
  );
}
