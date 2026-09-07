/**
 * `YYYY-MM-DD` in the machine's local timezone, and NOT in UTC: a 23:40
 * recording belongs to that evening, not to tomorrow. Shared so Pocket
 * episodes and WHOOP records land on the same key and a day view can join them.
 */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
