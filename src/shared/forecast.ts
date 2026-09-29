// What the popup shows: this week's "weather" and the Up next lists.
// Pure functions of the stored deadlines and the current time.

import type { Deadline } from "../types";

const DAY = 864e5;
export const WINDOW_DAYS = 7;
export const LATER_DAYS = 21;
const LATER_LIMIT = 5;

export type Weather = "storm" | "cloudy" | "clear";

export interface Outlook {
  weather: Weather;
  count: number;   // things still to do in the window
  stake: number;   // their combined weight, in percent of final grades
}

// Thresholds are a first guess to tune with real use: a storm is a quarter
// of a course's worth of grades, or four things, in one week.
const STORM_STAKE = 25;
const STORM_COUNT = 4;
const CLOUDY_STAKE = 10;
const CLOUDY_COUNT = 2;

export function visibleDeadlines(deadlines: Deadline[], hiddenEventCourseIds: number[]): Deadline[] {
  const hidden = new Set(hiddenEventCourseIds);
  return deadlines.filter((d) => !(d.kind === "event" && hidden.has(d.courseId)));
}

function within(d: Deadline, now: number, fromDays: number, toDays: number) {
  const t = Date.parse(d.dueAt);
  return t >= now + fromDays * DAY && t < now + toDays * DAY;
}

export function outlook(deadlines: Deadline[], now: Date): Outlook {
  const t = now.getTime();
  const todo = deadlines.filter((d) => within(d, t, 0, WINDOW_DAYS) && d.submitted !== true);
  const stake = Math.round(todo.reduce((s, d) => s + (d.weight ?? 0), 0) * 10) / 10;
  const count = todo.length;

  let weather: Weather = "clear";
  if (count && (stake >= STORM_STAKE || count >= STORM_COUNT)) weather = "storm";
  else if (count && (stake >= CLOUDY_STAKE || count >= CLOUDY_COUNT)) weather = "cloudy";
  return { weather, count, stake };
}

// "Up next" is the next 7 days, still-to-do first, heaviest first.
// "Later" is the two weeks after that, by date.
export function upNext(deadlines: Deadline[], now: Date): { soon: Deadline[]; later: Deadline[] } {
  const t = now.getTime();
  const byDate = (a: Deadline, b: Deadline) => Date.parse(a.dueAt) - Date.parse(b.dueAt);

  const soon = deadlines
    .filter((d) => within(d, t, 0, WINDOW_DAYS))
    .sort((a, b) =>
      Number(a.submitted === true) - Number(b.submitted === true) ||
      (b.weight ?? 0) - (a.weight ?? 0) ||
      byDate(a, b),
    );
  const later = deadlines
    .filter((d) => within(d, t, WINDOW_DAYS, LATER_DAYS))
    .sort(byDate)
    .slice(0, LATER_LIMIT);
  return { soon, later };
}
