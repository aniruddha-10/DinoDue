import { describe, expect, it } from "vitest";
import type { CourseCandidate, Deadline } from "../types";
import { buildWeeks, mondayOf, termRange } from "./skyline";

// Local time (TZ=America/Edmonton in vitest config). Mon Sep 28 2026, noon.
const NOW = new Date(2026, 8, 28, 12, 0);

let n = 0;
const dl = (due: Date, weight: number | null, extra: Partial<Deadline> = {}): Deadline => ({
  id: `d${++n}`,
  sourceId: n,
  courseId: 1,
  kind: "assignment",
  title: `Item ${n}`,
  dueAt: due.toISOString(),
  url: null,
  submitted: false,
  gradeItemId: null,
  gradeLink: null,
  weight,
  grade: null,
  ...extra,
});
const course = (startDate: string | null, endDate: string | null): CourseCandidate => ({
  id: 1,
  code: null,
  name: "C",
  startDate,
  endDate,
  lastAccessed: null,
  suggested: true,
  reason: null,
});

describe("mondayOf", () => {
  it("snaps any day, including Sunday night, to that week's Monday", () => {
    expect(mondayOf(new Date(2026, 9, 4, 23, 59)).toDateString()).toBe(new Date(2026, 8, 28).toDateString());
    expect(mondayOf(new Date(2026, 8, 28, 0, 1)).toDateString()).toBe(new Date(2026, 8, 28).toDateString());
  });
});

describe("termRange", () => {
  it("uses the courses' D2L dates when they have them", () => {
    const r = termRange([course("2026-09-02T06:00:00Z", "2026-12-18T06:00:00Z")], [], NOW);
    expect(r.start.toDateString()).toBe(new Date(2026, 7, 31).toDateString()); // Mon Aug 31
    expect(r.weeks).toBe(16);
  });

  it("falls back to the span of the deadlines, always including this week", () => {
    const r = termRange([course(null, null)], [dl(new Date(2026, 9, 20), 10), dl(new Date(2026, 10, 3), 10)], NOW);
    expect(r.start.toDateString()).toBe(new Date(2026, 8, 28).toDateString());
    expect(r.weeks).toBe(6);
  });

  it("caps very long spans at 20 weeks around this week", () => {
    const r = termRange([course("2025-09-01T06:00:00Z", "2027-04-30T06:00:00Z")], [], NOW);
    expect(r.weeks).toBe(20);
    expect(r.start.toDateString()).toBe(new Date(2026, 8, 14).toDateString()); // two weeks back
  });
});

describe("buildWeeks", () => {
  const range = { start: new Date(2026, 8, 21), weeks: 3 }; // Sep 21, Sep 28, Oct 5

  it("groups by Monday-to-Sunday and flags the current and past weeks", () => {
    const weeks = buildWeeks([dl(new Date(2026, 8, 22), 5), dl(new Date(2026, 9, 4, 23, 59), 10)], range, NOW);
    expect(weeks.map((w) => [w.count, w.weight, w.isCurrent, w.isPast])).toEqual([
      [1, 5, false, true],
      [1, 10, true, false],
      [0, 0, false, false],
    ]);
  });

  it("splits submitted from still-to-do and judges the weather on what's left", () => {
    const weeks = buildWeeks(
      [dl(new Date(2026, 8, 29), 20, { submitted: true }), dl(new Date(2026, 8, 30), 26), dl(new Date(2026, 9, 1), null)],
      range,
      NOW,
    );
    expect(weeks[1]).toMatchObject({ weight: 46, todoWeight: 26, count: 3, weather: "storm" });
    expect(weeks[1].items.map((d) => d.weight)).toEqual([20, 26, null]); // by due date
  });
});
