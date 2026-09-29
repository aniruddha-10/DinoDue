import { describe, expect, it } from "vitest";
import type { Deadline } from "../types";
import { dueReminders, pruneSent, sentKey } from "./reminders";

const NOW = new Date("2026-09-28T18:00:00Z");
const inHours = (h: number) => new Date(NOW.getTime() + h * 36e5).toISOString();
const ON = { enabled: true, leadsHours: [48, 3] };

const dl = (id: string, hours: number, extra: Partial<Deadline> = {}): Deadline => ({
  id,
  sourceId: 1,
  courseId: 1,
  kind: "assignment",
  title: id,
  dueAt: inHours(hours),
  url: null,
  submitted: false,
  gradeItemId: null,
  gradeLink: null,
  weight: null,
  grade: null,
  ...extra,
});
const ids = (r: ReturnType<typeof dueReminders>) => r.map((x) => [x.deadline.id, x.leadHours, x.keys]);

describe("dueReminders", () => {
  it("fires each lead time once the deadline is inside it", () => {
    const r = dueReminders([dl("in30h", 30), dl("in60h", 60)], [], ON, {}, NOW);
    expect(ids(r)).toEqual([["in30h", 48, ["in30h@48"]]]);
  });

  it("doesn't repeat a lead time that was already sent, but fires the next one", () => {
    const d = dl("a", 2);
    expect(ids(dueReminders([d], [], ON, { [sentKey("a", 48)]: 1 }, NOW))).toEqual([["a", 3, ["a@3"]]]);
    expect(dueReminders([d], [], ON, { "a@48": 1, "a@3": 1 }, NOW)).toEqual([]);
  });

  it("shows only the most urgent reminder when several are due at once, and marks all sent", () => {
    expect(ids(dueReminders([dl("late", 1)], [], ON, {}, NOW))).toEqual([["late", 3, ["late@3", "late@48"]]]);
  });

  it("skips submitted, past, and hidden-event deadlines, but reminds when submission is unknown", () => {
    const r = dueReminders(
      [
        dl("done", 5, { submitted: true }),
        dl("past", -1),
        dl("hidden", 5, { kind: "event", courseId: 2 }),
        dl("quiz", 5, { kind: "quiz", submitted: null }),
      ],
      [2],
      ON,
      {},
      NOW,
    );
    expect(r.map((x) => x.deadline.id)).toEqual(["quiz"]);
  });

  it("does nothing when reminders are off or have no lead times", () => {
    expect(dueReminders([dl("a", 1)], [], { enabled: false, leadsHours: [48] }, {}, NOW)).toEqual([]);
    expect(dueReminders([dl("a", 1)], [], { enabled: true, leadsHours: [] }, {}, NOW)).toEqual([]);
  });

  it("lists soonest first", () => {
    const r = dueReminders([dl("b", 20), dl("a", 10)], [], ON, {}, NOW);
    expect(r.map((x) => x.deadline.id)).toEqual(["a", "b"]);
  });
});

describe("pruneSent", () => {
  it("keeps markers for upcoming or just-passed deadlines and drops the rest", () => {
    const deadlines = [dl("soon", 5), dl("yesterday-ish", -10), dl("old", -30)];
    const sent = { "soon@48": 1, "yesterday-ish@48": 1, "old@48": 1, "gone@3": 1 };
    expect(Object.keys(pruneSent(sent, deadlines, NOW))).toEqual(["soon@48", "yesterday-ish@48"]);
  });

  it("handles ids that contain @", () => {
    expect(Object.keys(pruneSent({ "x@y@48": 1 }, [dl("x@y", 5)], NOW))).toEqual(["x@y@48"]);
  });
});
