import { describe, expect, it } from "vitest";
import type { Deadline } from "../types";
import { outlook, upNext, visibleDeadlines } from "./forecast";

const NOW = new Date("2026-09-28T18:00:00Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 864e5).toISOString();

let n = 0;
const dl = (days: number, weight: number | null, extra: Partial<Deadline> = {}): Deadline => ({
  id: `d${n++}`,
  sourceId: n,
  courseId: 1,
  kind: "assignment",
  title: `Item ${n}`,
  dueAt: inDays(days),
  url: null,
  submitted: false,
  gradeItemId: null,
  gradeLink: null,
  weight,
  grade: null,
  ...extra,
});

describe("outlook", () => {
  it("is a storm when a quarter of a course's grades land in one week", () => {
    expect(outlook([dl(1, 25), dl(20, 50)], NOW)).toEqual({ weather: "storm", count: 1, stake: 25 });
  });

  it("is a storm with four things due, whatever their weight", () => {
    expect(outlook([dl(1, 1), dl(2, 1), dl(3, null), dl(4, null)], NOW).weather).toBe("storm");
  });

  it("is cloudy for a moderate week", () => {
    expect(outlook([dl(1, 5), dl(2, 5)], NOW)).toMatchObject({ weather: "cloudy", stake: 10 });
    expect(outlook([dl(1, 12)], NOW).weather).toBe("cloudy");
  });

  it("is clear when nothing is left to do, ignoring submitted, past and later items", () => {
    const o = outlook([dl(1, 40, { submitted: true }), dl(-1, 30), dl(8, 30)], NOW);
    expect(o).toEqual({ weather: "clear", count: 0, stake: 0 });
  });
});

describe("upNext", () => {
  it("puts to-do items first, heaviest first, then by date", () => {
    const light = dl(1, 2);
    const heavy = dl(5, 30);
    const done = dl(0.5, 40, { submitted: true });
    const unweighted = dl(2, null);
    const { soon } = upNext([light, heavy, done, unweighted], NOW);
    expect(soon.map((d) => d.id)).toEqual([heavy.id, light.id, unweighted.id, done.id]);
  });

  it("lists the following two weeks by date, up to five", () => {
    const later = [dl(20, 1), dl(8, 1), dl(9, 1), dl(10, 1), dl(11, 1), dl(12, 1), dl(25, 1)];
    const r = upNext(later, NOW);
    expect(r.soon).toEqual([]);
    expect(r.later.map((d) => d.dueAt)).toEqual([inDays(8), inDays(9), inDays(10), inDays(11), inDays(12)]);
  });
});

describe("visibleDeadlines", () => {
  it("hides calendar events only for the courses the student chose", () => {
    const list = [dl(1, 0, { kind: "event", courseId: 1 }), dl(1, 0, { kind: "event", courseId: 2 }), dl(1, 0, { courseId: 1 })];
    expect(visibleDeadlines(list, [1]).map((d) => [d.kind, d.courseId])).toEqual([
      ["event", 2],
      ["assignment", 1],
    ]);
  });
});
