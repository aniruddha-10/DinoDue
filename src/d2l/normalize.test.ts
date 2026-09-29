import { describe, expect, it } from "vitest";
import type { RawCalendarEvent, RawCourse, RawEnrollment } from "./api";
import { assignmentsToDeadlines, buildCandidates, eventsToDeadlines, hasTermTag, quizzesToDeadlines } from "./normalize";

const NOW = new Date("2026-09-28T18:00:00Z");

const course = (id: string, extra: Partial<RawCourse> = {}): RawCourse => ({
  OrgUnitId: id,
  Name: `Course ${id}`,
  Code: null,
  CanAccessCourse: true,
  StartDate: null,
  EndDate: null,
  ...extra,
});
const enrol = (id: number, role: string): RawEnrollment => ({ OrgUnit: { Id: id }, Access: { ClasslistRoleName: role } });

describe("hasTermTag", () => {
  it.each([
    ["CPSC 331 - Fall 2026", true],
    ["F2026-CPSC331-L01", true],
    ["CPSC331_2026F", true],
    ["fall_2026 MATH 267", true],
    ["Fall 2025", false],
    ["Winter 2026", false],
    ["Fafall2026", false],
    [null, false],
  ])("%s -> %s", (text, expected) => {
    expect(hasTermTag(text, NOW)).toBe(expected);
  });
});

describe("buildCandidates", () => {
  it("drops locked courses and courses where the student isn't a student", () => {
    const out = buildCandidates(
      [course("1"), course("2", { CanAccessCourse: false }), course("3")],
      [enrol(1, "Student"), enrol(3, "TA - full access")],
      NOW,
    );
    expect(out.map((c) => c.id)).toEqual([1]);
  });

  it("keeps courses with no enrollment record (role unknown)", () => {
    expect(buildCandidates([course("9")], [], NOW).map((c) => c.id)).toEqual([9]);
  });

  it("suggests current courses by dates, term tag, or recent use, and lists them first", () => {
    const out = buildCandidates(
      [
        course("1", { LastAccessed: "2025-01-01T00:00:00Z" }),
        course("2", { StartDate: "2026-09-01T00:00:00Z", EndDate: "2026-12-20T00:00:00Z" }),
        course("3", { Name: "MATH 267 Fall 2026" }),
        course("4", { LastAccessed: "2026-09-25T00:00:00Z" }),
      ],
      [],
      NOW,
    );
    expect(out.map((c) => [c.id, c.reason])).toEqual([
      [4, "recentlyOpened"],
      [2, "dates"],
      [3, "termInName"],
      [1, null],
    ]);
  });

  it("doesn't suggest a course that has ended, even if opened recently", () => {
    const [c] = buildCandidates(
      [course("1", { StartDate: "2026-01-01T00:00:00Z", EndDate: "2026-04-30T00:00:00Z", LastAccessed: "2026-09-27T00:00:00Z" })],
      [],
      NOW,
    );
    expect(c.suggested).toBe(false);
  });
});

describe("assignmentsToDeadlines", () => {
  const folders = [
    { Id: 1, Name: "A1", DueDate: "2026-10-01T06:00:00Z", GradeItemId: 50 },
    { Id: 2, Name: "A2", DueDate: null, Availability: { StartDate: null, EndDate: "2026-10-08T06:00:00Z" } },
    { Id: 3, Name: "No date", DueDate: null },
    { Id: 4, Name: "Hidden", DueDate: "2026-10-01T06:00:00Z", IsHidden: true },
    { Id: 5, Name: "A3", DueDate: "2026-10-15T06:00:00Z" },
  ];
  const subs = new Map([
    [1, [{ Submissions: [{ Id: 9, SubmissionDate: "2026-09-30T00:00:00Z" }] }]],
    [2, [{ Submissions: [] }]],
    [5, null],
  ]);
  const out = assignmentsToDeadlines(100, folders, subs);

  it("skips hidden and undated folders, falling back to the availability end date", () => {
    expect(out.map((d) => [d.sourceId, d.dueAt])).toEqual([
      [1, "2026-10-01T06:00:00Z"],
      [2, "2026-10-08T06:00:00Z"],
      [5, "2026-10-15T06:00:00Z"],
    ]);
  });

  it("reports submitted, not submitted, and unknown", () => {
    expect(out.map((d) => d.submitted)).toEqual([true, false, null]);
  });

  it("keeps D2L's grade item id for linking", () => {
    expect(out[0]).toMatchObject({ id: "assignment-100-1", gradeItemId: 50, courseId: 100, kind: "assignment" });
  });
});

describe("quizzesToDeadlines", () => {
  it("uses EndDate when DueDate is empty (the usual case at UCalgary) and skips inactive quizzes", () => {
    const out = quizzesToDeadlines(100, [
      { QuizId: 1, Name: "Q1", DueDate: null, EndDate: "2026-10-02T06:00:00Z" },
      { QuizId: 2, Name: "Q2", DueDate: "2026-10-03T06:00:00Z", EndDate: "2026-10-04T06:00:00Z" },
      { QuizId: 3, Name: "Off", DueDate: null, EndDate: "2026-10-05T06:00:00Z", IsActive: false },
      { QuizId: 4, Name: "Undated", DueDate: null, EndDate: null },
    ]);
    expect(out.map((d) => [d.sourceId, d.dueAt])).toEqual([
      [1, "2026-10-02T06:00:00Z"],
      [2, "2026-10-03T06:00:00Z"],
    ]);
  });
});

describe("eventsToDeadlines", () => {
  const event = (id: number, extra: Partial<RawCalendarEvent> = {}): RawCalendarEvent => ({
    CalendarEventId: id,
    OrgUnitId: 100,
    Title: `Event ${id}`,
    StartDateTime: "2026-10-20T18:00:00Z",
    EndDateTime: "2026-10-20T20:00:00Z",
    IsAllDayEvent: false,
    IsRecurring: false,
    IsAssociatedWithEntity: false,
    EventType: 1,
    ...extra,
  });

  it("keeps instructor-made events and drops tool due-dates and recurring classes", () => {
    const out = eventsToDeadlines(
      [event(1, { Title: "Midterm" }), event(2, { IsAssociatedWithEntity: true, EventType: 6 }), event(3, { IsRecurring: true })],
      "https://d2l.ucalgary.ca",
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "event-100-1", kind: "event", title: "Midterm", dueAt: "2026-10-20T18:00:00Z" });
  });

  it("only keeps links that stay on D2L", () => {
    const [onSite, offSite] = eventsToDeadlines(
      [
        event(1, { CalendarEventViewUrl: "https://d2l.ucalgary.ca/d2l/le/calendar/100/event/1/detailsview" }),
        event(2, { CalendarEventViewUrl: "https://example.com/x" }),
      ],
      "https://d2l.ucalgary.ca",
    );
    expect(onSite.url).toBe("/d2l/le/calendar/100/event/1/detailsview");
    expect(offSite.url).toBeNull();
  });
});
