/**
 * "2 hours ago" — how long ago something happened, for people rather than logs.
 *
 * A draft recovered from a closed tab is judged by how recent it is, and a
 * timestamp makes that arithmetic the reader's problem.
 */

const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function humanizedSince(when: Date, now: Date = new Date()): string {
  const seconds = Math.floor((now.getTime() - when.getTime()) / 1000);
  if (seconds < MINUTE) return "just now"; // includes a clock that has gone backwards
  if (seconds < HOUR) return formatter.format(-Math.floor(seconds / MINUTE), "minute");
  if (seconds < DAY) return formatter.format(-Math.floor(seconds / HOUR), "hour");
  return formatter.format(-Math.floor(seconds / DAY), "day");
}
