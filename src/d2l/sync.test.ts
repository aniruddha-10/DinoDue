import { describe, expect, it } from "vitest";
import { SignedOutError, createClient } from "./api";
import { runSync } from "./sync";

const ORIGIN = "https://d2l.ucalgary.ca";
const NOW = new Date("2026-09-28T18:00:00Z");
const LE = "/d2l/api/le/1.99";

type Route = unknown | ((url: URL) => Response);

// A tiny fake D2L: exact pathname -> JSON body, or a function for special cases.
function fakeD2L(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    const route = routes[url.pathname];
    if (route === undefined) return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    if (typeof route === "function") return (route as (u: URL) => Response)(url);
    return new Response(JSON.stringify(route), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { client: createClient(fetchImpl as typeof fetch, ORIGIN), calls };
}

const status = (code: number, type = "application/json") => () => new Response("", { status: code, headers: { "content-type": type } });

const BASE = {
  "/d2l/api/versions/": [
    { ProductCode: "lp", LatestVersion: "1.63" },
    { ProductCode: "le", LatestVersion: "1.99" },
  ],
  "/d2l/api/lp/1.63/users/whoami": { Identifier: "1", FirstName: "Sam", LastName: "X" },
  "/d2l/le/manageCourses/api/mycourses": {
    Bookmark: null,
    Courses: [
      { OrgUnitId: "100", Name: "CPSC 331", Code: null, CanAccessCourse: true, StartDate: "2026-09-01T00:00:00Z", EndDate: "2026-12-20T00:00:00Z" },
      { OrgUnitId: "200", Name: "Old course", Code: null, CanAccessCourse: false, StartDate: null, EndDate: null },
      { OrgUnitId: "300", Name: "TA course", Code: null, CanAccessCourse: true, StartDate: null, EndDate: null },
    ],
  },
  "/d2l/api/lp/1.63/enrollments/myenrollments/": {
    Items: [
      { OrgUnit: { Id: 100 }, Access: { ClasslistRoleName: "Student" } },
      { OrgUnit: { Id: 300 }, Access: { ClasslistRoleName: "TA - full access" } },
    ],
    PagingInfo: { Bookmark: null, HasMoreItems: false },
  },
};

const COURSE_100 = {
  [`${LE}/100/dropbox/folders/`]: [{ Id: 1, Name: "Assignment 1", DueDate: "2026-10-01T06:00:00Z", GradeItemId: 11 }],
  [`${LE}/100/dropbox/folders/1/submissions/mysubmissions/`]: [{ Submissions: [{ Id: 5, SubmissionDate: "2026-09-30T00:00:00Z" }] }],
  [`${LE}/100/quizzes/`]: { Objects: [{ QuizId: 2, Name: "Quiz 1", DueDate: null, EndDate: "2026-10-03T06:00:00Z" }], Next: null },
  [`${LE}/100/grades/setup/`]: { GradingSystem: "Weighted" },
  [`${LE}/100/grades/`]: [
    { Id: 11, Name: "Assignment 1", GradeType: "Numeric", CategoryId: 0, Weight: 20 },
    { Id: 12, Name: "Quiz 1", GradeType: "Numeric", CategoryId: 0, Weight: 10 },
    { Id: 13, Name: "Midterm", GradeType: "Numeric", CategoryId: 0, Weight: 30 },
    { Id: 14, Name: "Final exam", GradeType: "Numeric", CategoryId: 0, Weight: 40 },
  ],
  [`${LE}/100/grades/categories/`]: [],
  [`${LE}/100/grades/values/myGradeValues/`]: [
    { GradeObjectIdentifier: "11", GradeObjectType: 1, PointsNumerator: 18, PointsDenominator: 20, WeightedNumerator: 18, WeightedDenominator: 20, DisplayedGrade: "90 %" },
  ],
  [`${LE}/calendar/events/myEvents/`]: {
    Objects: [
      { CalendarEventId: 7, OrgUnitId: 100, Title: "Midterm", StartDateTime: "2026-10-20T18:00:00Z", EndDateTime: "2026-10-20T20:00:00Z", IsAllDayEvent: false, IsRecurring: false, IsAssociatedWithEntity: false, EventType: 1 },
      { CalendarEventId: 8, OrgUnitId: 100, Title: "Quiz 1 - Due", StartDateTime: "2026-10-03T06:00:00Z", EndDateTime: "2026-10-03T06:00:00Z", IsAllDayEvent: false, IsRecurring: false, IsAssociatedWithEntity: true, EventType: 6 },
    ],
    Next: null,
  },
};

describe("runSync", () => {
  it("only fetches the course list until the student confirms the picker", async () => {
    const { client, calls } = fakeD2L(BASE);
    const r = await runSync(client, { selectedCourseIds: null, manualGradeLinks: {} }, NOW, ORIGIN);

    expect(r.user).toEqual({ firstName: "Sam" });
    expect(r.candidates.map((c) => [c.id, c.suggested])).toEqual([[100, true]]); // locked and TA courses dropped
    expect(r.deadlines).toEqual([]);
    expect(calls.some((p) => p.includes("/dropbox/"))).toBe(false);
  });

  it("builds weighted, linked deadlines for the selected courses", async () => {
    const { client, calls } = fakeD2L({ ...BASE, ...COURSE_100 });
    const r = await runSync(client, { selectedCourseIds: [100, 300], manualGradeLinks: {} }, NOW, ORIGIN);

    // Course 300 (TA) isn't a candidate, so it's never fetched even though it was selected.
    expect(calls.some((p) => p.startsWith(`${LE}/300/`))).toBe(false);

    expect(r.deadlines.map((d) => [d.kind, d.title, d.weight, d.gradeLink, d.submitted])).toEqual([
      ["assignment", "Assignment 1", 20, "d2l", true],
      ["quiz", "Quiz 1", 10, "name", null],
      ["event", "Midterm", 30, "name", null], // the tool-linked calendar entry is skipped
    ]);
    expect(r.deadlines[0].grade).toEqual({ points: 18, outOf: 20, display: "90 %" });
    expect(r.weights).toEqual([
      { courseId: 100, rawTotal: 100, status: "exact", missing: 0, gradeSoFar: 90, releasedWeight: 20 },
    ]);
  });

  it("keeps going when a tool is blocked (403) in a course", async () => {
    const { client } = fakeD2L({ ...BASE, ...COURSE_100, [`${LE}/100/quizzes/`]: status(403) });
    const r = await runSync(client, { selectedCourseIds: [100], manualGradeLinks: {} }, NOW, ORIGIN);
    expect(r.deadlines.map((d) => d.kind)).toEqual(["assignment", "event"]);
  });

  it("marks submission status unknown when that lookup fails", async () => {
    const { client } = fakeD2L({
      ...BASE,
      ...COURSE_100,
      [`${LE}/100/dropbox/folders/1/submissions/mysubmissions/`]: status(500),
    });
    const r = await runSync(client, { selectedCourseIds: [100], manualGradeLinks: {} }, NOW, ORIGIN);
    expect(r.deadlines[0].submitted).toBeNull();
  });

  it("applies the student's manual grade links", async () => {
    const { client } = fakeD2L({ ...BASE, ...COURSE_100 });
    const r = await runSync(client, { selectedCourseIds: [100], manualGradeLinks: { "event-100-7": null } }, NOW, ORIGIN);
    expect(r.deadlines.find((d) => d.kind === "event")).toMatchObject({ gradeItemId: null, gradeLink: "manual", weight: null });
  });

  it("throws SignedOutError on 401 or when D2L returns its login page", async () => {
    const a = fakeD2L({ ...BASE, "/d2l/api/versions/": status(401) });
    await expect(runSync(a.client, { selectedCourseIds: null, manualGradeLinks: {} }, NOW, ORIGIN)).rejects.toBeInstanceOf(SignedOutError);

    const b = fakeD2L({ ...BASE, "/d2l/le/manageCourses/api/mycourses": status(200, "text/html") });
    await expect(runSync(b.client, { selectedCourseIds: null, manualGradeLinks: {} }, NOW, ORIGIN)).rejects.toBeInstanceOf(SignedOutError);
  });

  it("refuses to follow a paging link off D2L", async () => {
    const { client, calls } = fakeD2L({
      ...BASE,
      ...COURSE_100,
      [`${LE}/100/quizzes/`]: { Objects: [], Next: "https://evil.example.com/steal" },
    });
    await expect(runSync(client, { selectedCourseIds: [100], manualGradeLinks: {} }, NOW, ORIGIN)).rejects.toThrow(/off-origin/);
    expect(calls.some((p) => p.includes("steal"))).toBe(false);
  });
});
