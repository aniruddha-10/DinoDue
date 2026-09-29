// The term forecast: deadlines grouped into Monday-to-Sunday weeks across the
// term, with each week's weight and weather. Pure, so it's unit-tested.

import type { CourseCandidate, Deadline } from "../types";
import { classify, type Weather } from "./forecast";

const DAY = 864e5;
const MAX_WEEKS = 20;
const DEFAULT_WEEKS_BEFORE = 2;
const DEFAULT_WEEKS_AFTER = 12;

export interface Week {
  start: Date;          // Monday 00:00, local time
  items: Deadline[];    // by due date
  weight: number;       // everything due that week, percent of final grades
  todoWeight: number;   // the part not yet submitted
  count: number;
  weather: Weather;     // judged on what's still to do
  isCurrent: boolean;
  isPast: boolean;
}

export function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

const addWeeks = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n * 7);
  return r;
};

// The term's span: the selected courses' D2L dates when they have them,
// otherwise the span of the deadlines, and always including this week.
export function termRange(courses: CourseCandidate[], deadlines: Deadline[], now: Date): { start: Date; weeks: number } {
  const starts = courses.map((c) => c.startDate).filter(Boolean).map((s) => Date.parse(s!));
  const ends = courses.map((c) => c.endDate).filter(Boolean).map((s) => Date.parse(s!));
  const due = deadlines.map((d) => Date.parse(d.dueAt));

  let from = starts.length ? Math.min(...starts) : due.length ? Math.min(...due) : now.getTime() - DEFAULT_WEEKS_BEFORE * 7 * DAY;
  let to = ends.length ? Math.max(...ends) : due.length ? Math.max(...due) : now.getTime() + DEFAULT_WEEKS_AFTER * 7 * DAY;
  from = Math.min(from, now.getTime());
  to = Math.max(to, now.getTime());

  let start = mondayOf(new Date(from));
  let weeks = Math.round((mondayOf(new Date(to)).getTime() - start.getTime()) / (7 * DAY)) + 1;
  if (weeks > MAX_WEEKS) {
    // Keep this week in view: a couple of weeks back, the rest ahead.
    const current = mondayOf(now);
    start = start.getTime() < addWeeks(current, -DEFAULT_WEEKS_BEFORE).getTime() ? addWeeks(current, -DEFAULT_WEEKS_BEFORE) : start;
    weeks = MAX_WEEKS;
  }
  return { start, weeks };
}

export function buildWeeks(deadlines: Deadline[], range: { start: Date; weeks: number }, now: Date): Week[] {
  const current = mondayOf(now).getTime();
  const round1 = (n: number) => Math.round(n * 10) / 10;

  return Array.from({ length: range.weeks }, (_, i) => {
    const start = addWeeks(range.start, i);
    const end = addWeeks(start, 1).getTime();
    const items = deadlines
      .filter((d) => {
        const t = Date.parse(d.dueAt);
        return t >= start.getTime() && t < end;
      })
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
    const todo = items.filter((d) => d.submitted !== true);
    const todoWeight = round1(todo.reduce((s, d) => s + (d.weight ?? 0), 0));
    return {
      start,
      items,
      weight: round1(items.reduce((s, d) => s + (d.weight ?? 0), 0)),
      todoWeight,
      count: items.length,
      weather: classify(todoWeight, todo.length),
      isCurrent: start.getTime() === current,
      isPast: end <= now.getTime(),
    };
  });
}
