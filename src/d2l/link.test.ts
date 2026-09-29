import { describe, expect, it } from "vitest";
import type { Deadline } from "../types";
import type { RawGradeObject } from "./api";
import { linkGradeItems } from "./link";

const deadline = (id: string, title: string, gradeItemId: number | null = null): Deadline => ({
  id,
  sourceId: 1,
  courseId: 100,
  kind: "assignment",
  title,
  dueAt: "2026-10-01T06:00:00Z",
  url: null,
  submitted: null,
  gradeItemId,
  gradeLink: null,
  weight: null,
  grade: null,
});
const grade = (Id: number, Name: string, ShortName: string | null = null): RawGradeObject => ({
  Id,
  Name,
  ShortName,
  GradeType: "Numeric",
  CategoryId: 0,
});

const links = (ds: Deadline[]) => ds.map((d) => [d.id, d.gradeItemId, d.gradeLink]);

describe("linkGradeItems", () => {
  const items = [grade(1, "Assignment 1"), grade(2, "Assignment 2"), grade(3, "Midterm Exam", "MT"), grade(4, "Quiz 1"), grade(5, "Quiz 10")];

  it("prefers D2L's own link, then exact names, then close names", () => {
    const out = linkGradeItems(
      [deadline("a", "Anything", 2), deadline("b", "assignment-1"), deadline("c", "Midterm")],
      items,
      {},
    );
    expect(links(out)).toEqual([
      ["a", 2, "d2l"],
      ["b", 1, "name"],
      ["c", 3, "fuzzy"],
    ]);
  });

  it("matches a grade item's short name exactly", () => {
    expect(links(linkGradeItems([deadline("a", "MT")], items, {}))).toEqual([["a", 3, "name"]]);
  });

  it("falls back to names when D2L links to a grade item that doesn't exist", () => {
    expect(links(linkGradeItems([deadline("a", "Quiz 1", 999)], items, {}))).toEqual([["a", 4, "name"]]);
  });

  it("doesn't confuse Quiz 1 with Quiz 10", () => {
    const out = linkGradeItems([deadline("a", "Quiz 10 (online)")], items, {});
    expect(links(out)).toEqual([["a", 5, "fuzzy"]]);
  });

  it("leaves ties for the student instead of guessing", () => {
    const out = linkGradeItems([deadline("a", "Assignment")], items, {});
    expect(links(out)).toEqual([["a", null, null]]);
  });

  it("never gives one grade item to two deadlines by name", () => {
    const out = linkGradeItems([deadline("a", "Assignment 1", 1), deadline("b", "Assignment 1")], items, {});
    expect(links(out)).toEqual([
      ["a", 1, "d2l"],
      ["b", null, null],
    ]);
  });

  it("lets the student's choice override everything, including 'not graded'", () => {
    const out = linkGradeItems([deadline("a", "Assignment 1", 1), deadline("b", "Assignment 2")], items, { a: 4, b: null });
    expect(links(out)).toEqual([
      ["a", 4, "manual"],
      ["b", null, "manual"],
    ]);
  });
});
