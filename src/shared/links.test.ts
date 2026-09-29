import { describe, expect, it } from "vitest";
import type { CourseWeights, Deadline, GradeItemInfo } from "../types";
import { applyManualLinks, needsReview } from "./links";

const dl = (id: string, extra: Partial<Deadline> = {}): Deadline => ({
  id,
  sourceId: 1,
  courseId: 1,
  kind: "assignment",
  title: id,
  dueAt: "2026-10-01T06:00:00Z",
  url: null,
  submitted: null,
  gradeItemId: null,
  gradeLink: null,
  weight: null,
  grade: null,
  ...extra,
});
const items: GradeItemInfo[] = [
  { courseId: 1, id: 10, name: "Assignment 1", weight: 12.5, grade: { points: 9, outOf: 10, display: "90 %" } },
  { courseId: 2, id: 10, name: "Other course, same id", weight: 99, grade: null },
];
const weights = (courseId: number, status: CourseWeights["status"]): CourseWeights => ({
  courseId,
  status,
  rawTotal: 100,
  missing: 0,
  gradeSoFar: null,
  releasedWeight: 0,
});

describe("applyManualLinks", () => {
  it("takes the weight and grade from the chosen item in the same course", () => {
    const [d] = applyManualLinks([dl("a")], items, { a: 10 });
    expect(d).toMatchObject({ gradeItemId: 10, gradeLink: "manual", weight: 12.5, grade: { display: "90 %" } });
  });

  it("clears weight and grade for 'not graded'", () => {
    const [d] = applyManualLinks([dl("a", { gradeItemId: 10, gradeLink: "fuzzy", weight: 12.5 })], items, { a: null });
    expect(d).toMatchObject({ gradeItemId: null, gradeLink: "manual", weight: null, grade: null });
  });

  it("leaves deadlines without a manual choice untouched", () => {
    const orig = dl("b", { gradeItemId: 10, gradeLink: "d2l", weight: 5 });
    expect(applyManualLinks([orig], items, { a: 10 })[0]).toBe(orig);
  });
});

describe("needsReview", () => {
  it("lists guessed, unmatched, and student-set deadlines in weighted courses only", () => {
    const deadlines = [
      dl("ok", { gradeItemId: 1, gradeLink: "d2l" }),
      dl("fuzzy", { gradeItemId: 2, gradeLink: "fuzzy", dueAt: "2026-10-03T06:00:00Z" }),
      dl("none", { dueAt: "2026-10-02T06:00:00Z" }),
      dl("mine", { gradeLink: "manual" }),
      dl("unweighted-course", { courseId: 3 }),
      dl("hidden-event", { kind: "event", courseId: 1 }),
    ];
    const list = needsReview({ deadlines, hiddenEventCourseIds: [1], weights: [weights(1, "exact"), weights(3, "none")] });
    expect(list.map((d) => d.id)).toEqual(["mine", "none", "fuzzy"]);
  });
});
