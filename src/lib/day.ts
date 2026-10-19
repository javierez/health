/**
 * Everything is read on Madrid's clock. A 23:40 recording belongs to that
 * evening, not to tomorrow, and Vercel runs in UTC: reading the machine's own
 * zone filed every late-evening fact under the next day in production.
 */
export const TIME_ZONE = "Europe/Madrid";

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });
const clockFmt = new Intl.DateTimeFormat("es-ES", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** `YYYY-MM-DD` in Madrid. Shared so every source lands on the same key. */
export function localDay(d: Date): string {
  return dayFmt.format(d);
}

/** `HH:mm` in Madrid. */
export function localClock(d: Date): string {
  return clockFmt.format(d);
}

/** Minutes since local midnight, in Madrid. */
export function localMinutes(d: Date): number {
  const [h, m] = localClock(d).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** `9 h 05`. Minutes in, the way every screen and message says a duration. */
export function hm(minutes: number | null): string {
  if (minutes === null) return "?";
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

const noon = (day: string) => new Date(`${day}T12:00:00Z`);

/** `YYYY-MM-DD` plus or minus whole days. Noon UTC, so no DST edge moves it. */
export function addDays(day: string, n: number): string {
  return new Date(noon(day).getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from one `YYYY-MM-DD` to another: 6 from the 12th to the 18th. */
export const daysBetween = (from: string, to: string) => Math.round((noon(to).getTime() - noon(from).getTime()) / 86_400_000);

/** "Hoy", "Ayer", or "dom, 6 sept". */
export function dayTitle(day: string, today: string): string {
  if (day === today) return "Hoy";
  if (day === addDays(today, -1)) return "Ayer";
  return new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    noon(day),
  );
}

/** L M X J V S D. */
export function weekdayLetter(day: string): string {
  return new Intl.DateTimeFormat("es-ES", { weekday: "narrow", timeZone: "UTC" }).format(noon(day));
}
