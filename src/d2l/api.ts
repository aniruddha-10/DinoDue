// Every request to UCalgary's D2L (Brightspace) API lives here. It runs
// inside a D2L tab, so the student's own login cookie goes with each request.
// No passwords, no OAuth. GET requests only.
//
// The Raw* shapes list only the fields we use. They were checked against real
// d2l.ucalgary.ca responses with probe/d2l-probe.js and probe/d2l-probe-2.js.

import { D2L_ORIGIN } from "../types";

export class SignedOutError extends Error {}
export class HttpError extends Error {
  constructor(public status: number, path: string) {
    super(`${status} from ${path}`);
  }
}

export type Fetch = typeof fetch;

export interface D2LClient {
  get<T>(pathOrUrl: string): Promise<T>;
}

export function createClient(fetchImpl: Fetch = fetch, origin = D2L_ORIGIN): D2LClient {
  return {
    async get<T>(pathOrUrl: string): Promise<T> {
      const url = new URL(pathOrUrl, origin);
      // Paging links come from responses; never follow one off D2L.
      if (url.origin !== origin) throw new Error(`Refusing to fetch off-origin URL ${url.origin}`);
      const res = await fetchImpl(url.href, { credentials: "include", headers: { Accept: "application/json" } });
      if (res.status === 401) throw new SignedOutError();
      if (!res.ok) throw new HttpError(res.status, url.pathname);
      // A login page instead of JSON means the session expired.
      if (!(res.headers.get("content-type") ?? "").includes("json")) throw new SignedOutError();
      return (await res.json()) as T;
    },
  };
}

// ---- Raw shapes ----

interface RawVersion { ProductCode: string; LatestVersion: string }

export interface RawWhoAmI { Identifier: string; FirstName: string; LastName: string }

// /d2l/le/manageCourses/api/mycourses. OrgUnitId arrives as a string.
// SemesterName exists but is empty at UCalgary.
export interface RawCourse {
  OrgUnitId: string;
  Name: string;
  Code: string | null;
  IsActive?: boolean;
  CanAccessCourse?: boolean;
  StartDate: string | null;
  EndDate: string | null;
  LastAccessed?: string | null;
}
interface RawCoursePage { Courses: RawCourse[]; Bookmark: string | null }

// /d2l/api/lp/{v}/enrollments/myenrollments/. We only need the role, to skip
// courses where the student is a TA or instructor.
export interface RawEnrollment {
  OrgUnit: { Id: number };
  Access: { ClasslistRoleName: string | null; CanAccess?: boolean };
}
interface RawEnrollmentPage { Items: RawEnrollment[]; PagingInfo: { Bookmark: string | null; HasMoreItems: boolean } }

export interface RawFolder {
  Id: number;
  Name: string;
  DueDate: string | null;
  IsHidden?: boolean;
  GradeItemId?: number | null;
  Availability?: { StartDate: string | null; EndDate: string | null } | null;
}
export interface RawEntityDropbox { Submissions?: { Id: number; SubmissionDate: string | null }[] }

// At UCalgary quizzes usually have EndDate but no DueDate.
export interface RawQuiz {
  QuizId: number;
  Name: string;
  DueDate: string | null;
  EndDate: string | null;
  IsActive?: boolean;
  GradeItemId?: number | null;
}

export interface RawGradeSetup { GradingSystem: "Weighted" | "Points" | "Formula" | string }

export interface RawGradeObject {
  Id: number;
  Name: string;
  ShortName?: string | null;
  GradeType: string;
  CategoryId: number;     // 0 = not in a category
  Weight?: number | null;
  MaxPoints?: number | null;
  IsBonus?: boolean;
  ExcludeFromFinalGradeCalculation?: boolean;
}

export interface RawGradeCategory {
  Id: number;
  Name: string;
  Weight?: number | null;
  ExcludeFromFinalGrade?: boolean;
}

export interface RawGradeValue {
  GradeObjectIdentifier: string | number;
  GradeObjectType: number;
  GradeObjectTypeName?: string | null;
  PointsNumerator: number | null;
  PointsDenominator: number | null;
  WeightedNumerator: number | null;
  WeightedDenominator: number | null;
  DisplayedGrade: string | null;
}

export interface RawCalendarEvent {
  CalendarEventId: number;
  OrgUnitId: number;
  Title: string;
  StartDateTime: string;
  EndDateTime: string;
  IsAllDayEvent: boolean;
  IsRecurring: boolean;
  IsAssociatedWithEntity: boolean;
  CalendarEventViewUrl?: string | null;
  EventType: number;
}
interface ObjectListPage<T> { Objects: T[]; Next: string | null }

// ---- Requests ----

// D2L versions its API per product ("lp" = platform, "le" = learning tools).
export async function getVersions(c: D2LClient): Promise<{ lp: string; le: string } | null> {
  const list = await c.get<RawVersion[]>("/d2l/api/versions/");
  const find = (code: string) => list.find((v) => v.ProductCode === code)?.LatestVersion;
  const lp = find("lp");
  const le = find("le");
  return lp && le ? { lp, le } : null;
}

export const getWhoAmI = (c: D2LClient, lp: string) => c.get<RawWhoAmI>(`/d2l/api/lp/${lp}/users/whoami`);

export async function getCourses(c: D2LClient): Promise<RawCourse[]> {
  const byId = new Map<string, RawCourse>();
  let bookmark = "";
  for (let page = 0; page < 20; page++) {
    const q = `?pageSize=20&sort=current&orgUnitTypeId=3&embedDepth=0${bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ""}`;
    const res = await c.get<RawCoursePage>(`/d2l/le/manageCourses/api/mycourses${q}`);
    for (const course of res.Courses) byId.set(course.OrgUnitId, course);
    const next = res.Courses.length ? (res.Bookmark ?? "") : "";
    if (!next || next === bookmark) break;
    bookmark = next;
  }
  return [...byId.values()];
}

export async function getEnrollments(c: D2LClient, lp: string): Promise<RawEnrollment[]> {
  const out: RawEnrollment[] = [];
  let bookmark = "";
  for (let page = 0; page < 20; page++) {
    const q = `?orgUnitTypeId=3${bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ""}`;
    const res = await c.get<RawEnrollmentPage>(`/d2l/api/lp/${lp}/enrollments/myenrollments/${q}`);
    out.push(...res.Items);
    if (!res.PagingInfo?.HasMoreItems || !res.PagingInfo.Bookmark) break;
    bookmark = res.PagingInfo.Bookmark;
  }
  return out;
}

// Some endpoints return a plain array, others a { Objects, Next } page.
async function getAllPages<T>(c: D2LClient, path: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = path;
  for (let page = 0; next && page < 50; page++) {
    const data: T[] | ObjectListPage<T> = await c.get(next);
    if (Array.isArray(data)) return data;
    out.push(...data.Objects);
    next = data.Next;
  }
  return out;
}

export const getFolders = (c: D2LClient, le: string, ou: number) =>
  c.get<RawFolder[]>(`/d2l/api/le/${le}/${ou}/dropbox/folders/`);

export const getMySubmissions = (c: D2LClient, le: string, ou: number, folderId: number) =>
  c.get<RawEntityDropbox[]>(`/d2l/api/le/${le}/${ou}/dropbox/folders/${folderId}/submissions/mysubmissions/`);

export const getQuizzes = (c: D2LClient, le: string, ou: number) =>
  getAllPages<RawQuiz>(c, `/d2l/api/le/${le}/${ou}/quizzes/`);

export const getGradeSetup = (c: D2LClient, le: string, ou: number) =>
  c.get<RawGradeSetup>(`/d2l/api/le/${le}/${ou}/grades/setup/`);

export const getGradeObjects = (c: D2LClient, le: string, ou: number) =>
  c.get<RawGradeObject[]>(`/d2l/api/le/${le}/${ou}/grades/`);

export const getGradeCategories = (c: D2LClient, le: string, ou: number) =>
  c.get<RawGradeCategory[]>(`/d2l/api/le/${le}/${ou}/grades/categories/`);

export const getMyGradeValues = (c: D2LClient, le: string, ou: number) =>
  c.get<RawGradeValue[]>(`/d2l/api/le/${le}/${ou}/grades/values/myGradeValues/`);

export function getCalendarEvents(c: D2LClient, le: string, ous: number[], from: Date, to: Date) {
  const q = `?orgUnitIdsCSV=${ous.join(",")}&startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}`;
  return getAllPages<RawCalendarEvent>(c, `/d2l/api/le/${le}/calendar/events/myEvents/${q}`);
}
