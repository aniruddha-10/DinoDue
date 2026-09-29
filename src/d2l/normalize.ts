// Raw D2L objects into clean Courses and Deadlines. Pure functions only, so
// everything here is unit-tested without a browser.

import type { CourseCandidate, Deadline, SuggestReason } from "../types";
import type { RawCalendarEvent, RawCourse, RawEnrollment, RawEntityDropbox, RawFolder, RawQuiz } from "./api";

const DAY = 864e5;
const RECENTLY_OPENED_DAYS = 14;

// UCalgary terms by month. Used only to spot term tags in course names.
export function currentTerm(now: Date): { season: string; year: number } {
  const m = now.getMonth();
  const season = m <= 3 ? "winter" : m <= 5 ? "spring" : m <= 7 ? "summer" : "fall";
  return { season, year: now.getFullYear() };
}

const SEASON_TAGS: Record<string, string[]> = {
  fall: ["fall", "f"],
  winter: ["winter", "w"],
  spring: ["spring", "sp", "p"],
  summer: ["summer", "su", "s"],
};

// Matches UCalgary's D2L course codes, which start with the term
// ("F2026CPSC482L01"), plus spelled-out forms like "Fall 2026" or "2026F".
export function hasTermTag(text: string | null, now: Date): boolean {
  if (!text) return false;
  const { season, year } = currentTerm(now);
  const s = text.toLowerCase();
  return SEASON_TAGS[season].some((tag) => {
    // Term then year may run straight into the subject ("f2026cpsc"), but not
    // into more digits ("f20261").
    const re = new RegExp(`(^|[^a-z0-9])(${tag}[\\s_-]?${year}(?![0-9])|${year}[\\s_-]?${tag}(?![a-z0-9]))`);
    return re.test(s);
  });
}

// "F2026CPSC482L01" -> "CPSC 482". Anything else is returned as is.
export function shortCourseCode(code: string | null): string | null {
  if (!code) return null;
  const m = /^[a-z]{1,2}\d{4}([a-z]{3,4})(\d{3})/i.exec(code.trim());
  return m ? `${m[1].toUpperCase()} ${m[2]}` : code;
}

// Which of the student's courses to offer in the picker, and which to pre-tick.
// Drops courses D2L has locked and courses where they aren't a student (a TA
// role would mix someone else's deadlines into theirs).
export function buildCandidates(courses: RawCourse[], enrollments: RawEnrollment[], now: Date): CourseCandidate[] {
  const role = new Map(enrollments.map((e) => [e.OrgUnit.Id, e.Access.ClasslistRoleName ?? ""]));
  const t = now.getTime();

  return courses
    .filter((c) => c.CanAccessCourse !== false)
    .filter((c) => {
      const r = role.get(Number(c.OrgUnitId));
      return r === undefined || /student/i.test(r);
    })
    .map((c): CourseCandidate => {
      const start = c.StartDate ? Date.parse(c.StartDate) : null;
      const end = c.EndDate ? Date.parse(c.EndDate) : null;
      const ended = end !== null && end < t;
      const opened = c.LastAccessed ? Date.parse(c.LastAccessed) : null;

      let reason: SuggestReason | null = null;
      if (start !== null && end !== null && start <= t && t <= end) reason = "dates";
      else if (!ended && (hasTermTag(c.Name, now) || hasTermTag(c.Code, now))) reason = "termInName";
      else if (!ended && opened !== null && t - opened <= RECENTLY_OPENED_DAYS * DAY) reason = "recentlyOpened";

      return {
        id: Number(c.OrgUnitId),
        code: c.Code,
        name: c.Name,
        startDate: c.StartDate,
        endDate: c.EndDate,
        lastAccessed: c.LastAccessed ?? null,
        suggested: reason !== null,
        reason,
      };
    })
    .sort((a, b) =>
      Number(b.suggested) - Number(a.suggested) ||
      (b.lastAccessed ? Date.parse(b.lastAccessed) : 0) - (a.lastAccessed ? Date.parse(a.lastAccessed) : 0),
    );
}

// Links into D2L's student pages. Paths follow Brightspace's standard
// student URLs; not yet clicked through on d2l.ucalgary.ca.
const assignmentUrl = (ou: number, id: number) => `/d2l/lms/dropbox/user/folder_submit_files.d2l?db=${id}&ou=${ou}`;
const quizUrl = (ou: number, id: number) => `/d2l/lms/quizzing/user/quiz_summary.d2l?qi=${id}&ou=${ou}`;

function base(courseId: number) {
  return { courseId, gradeLink: null, weight: null, grade: null } as const;
}

// `submissions` has an entry per folder we asked about: the response, or
// null if that lookup failed (so we say "unknown", not "not submitted").
export function assignmentsToDeadlines(
  courseId: number,
  folders: RawFolder[],
  submissions: Map<number, RawEntityDropbox[] | null>,
): Deadline[] {
  const out: Deadline[] = [];
  for (const f of folders) {
    if (f.IsHidden) continue;
    const dueAt = f.DueDate ?? f.Availability?.EndDate ?? null;
    if (!dueAt) continue;
    const subs = submissions.get(f.Id);
    out.push({
      ...base(courseId),
      id: `assignment-${courseId}-${f.Id}`,
      sourceId: f.Id,
      kind: "assignment",
      title: f.Name,
      dueAt,
      url: assignmentUrl(courseId, f.Id),
      submitted: subs == null ? null : subs.some((e) => (e.Submissions?.length ?? 0) > 0),
      gradeItemId: f.GradeItemId ?? null,
    });
  }
  return out;
}

export function quizzesToDeadlines(courseId: number, quizzes: RawQuiz[]): Deadline[] {
  const out: Deadline[] = [];
  for (const q of quizzes) {
    if (q.IsActive === false) continue;
    const dueAt = q.DueDate ?? q.EndDate;
    if (!dueAt) continue;
    out.push({
      ...base(courseId),
      id: `quiz-${courseId}-${q.QuizId}`,
      sourceId: q.QuizId,
      kind: "quiz",
      title: q.Name,
      dueAt,
      url: quizUrl(courseId, q.QuizId),
      submitted: null,
      gradeItemId: q.GradeItemId ?? null,
    });
  }
  return out;
}

// Calendar events linked to a quiz or assignment are D2L's automatic due-date
// entries, which we already have, so they're skipped. Recurring events are a
// class schedule, not deadlines. What's left is what instructors add by hand,
// which is where midterms show up.
export function eventsToDeadlines(events: RawCalendarEvent[], origin: string): Deadline[] {
  const out: Deadline[] = [];
  for (const e of events) {
    if (e.IsAssociatedWithEntity || e.IsRecurring) continue;
    let url: string | null = null;
    if (e.CalendarEventViewUrl) {
      const u = new URL(e.CalendarEventViewUrl, origin);
      if (u.origin === origin) url = u.pathname + u.search;
    }
    const courseId = Number(e.OrgUnitId);
    out.push({
      ...base(courseId),
      id: `event-${courseId}-${e.CalendarEventId}`,
      sourceId: e.CalendarEventId,
      kind: "event",
      title: e.Title,
      dueAt: e.StartDateTime,
      url,
      submitted: null,
      gradeItemId: null,
    });
  }
  return out;
}
