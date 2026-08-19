/**
 * "18 Aug 2026" — a date the reader can compare against a calendar.
 *
 * `humanizedSince` is the other half of this and stops being useful past a few
 * days: a pair of ears registered last spring is "150 days ago", which nobody
 * can place. The locale comes from the browser, so the `<time datetime>` the
 * caller wraps this in carries the machine-readable value.
 */

const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function calendarDate(when: Date): string {
  return formatter.format(when);
}
