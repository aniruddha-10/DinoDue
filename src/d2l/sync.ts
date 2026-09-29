// The whole fetch, step by step. Returns the new data; the caller saves it.
//
// Failure rules:
// - Signed out, or the network drops: the whole sync throws and the caller
//   keeps the previous data.
// - One endpoint returns an HTTP error (UCalgary blocks some tools in some
//   courses, e.g. a 403): treated as "nothing there" and the sync goes on.

import { D2L_ORIGIN, type CourseWeights, type Deadline, type Store, type User } from "../types";
import * as api from "./api";
import { HttpError, type D2LClient } from "./api";
import { linkGradeItems } from "./link";
import { assignmentsToDeadlines, buildCandidates, eventsToDeadlines, quizzesToDeadlines } from "./normalize";
import { buildWeights, gradeProgress } from "./weights";

const CONCURRENCY = 4;
const EVENTS_PAST_DAYS = 30;
const EVENTS_AHEAD_DAYS = 150;

export class NoApiVersionsError extends Error {}

export type SyncResult = Pick<Store, "user" | "candidates" | "deadlines" | "weights">;

// Resolves to `fallback` on an HTTP error; rethrows sign-out and network errors.
async function optional<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof HttpError) return fallback;
    throw e;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function syncCourse(
  c: D2LClient,
  le: string,
  courseId: number,
  events: Deadline[],
  manual: Record<string, number | null>,
): Promise<{ deadlines: Deadline[]; weights: CourseWeights }> {
  const [folders, quizzes, setup, objects, categories, values] = await Promise.all([
    optional(api.getFolders(c, le, courseId), []),
    optional(api.getQuizzes(c, le, courseId), []),
    optional(api.getGradeSetup(c, le, courseId), null),
    optional(api.getGradeObjects(c, le, courseId), []),
    optional(api.getGradeCategories(c, le, courseId), []),
    optional(api.getMyGradeValues(c, le, courseId), []),
  ]);

  const visible = folders.filter((f) => !f.IsHidden);
  const subs = await mapLimit(visible, CONCURRENCY, (f) => optional(api.getMySubmissions(c, le, courseId, f.Id), null));
  const submissions = new Map(visible.map((f, i) => [f.Id, subs[i]]));

  const raw = [
    ...assignmentsToDeadlines(courseId, folders, submissions),
    ...quizzesToDeadlines(courseId, quizzes),
    ...events,
  ];
  const linked = linkGradeItems(raw, objects, manual);

  const model = buildWeights(setup, objects, categories);
  const progress = gradeProgress(values, model.shareByItem);

  const deadlines = linked.map((d) => ({
    ...d,
    weight: d.gradeItemId !== null ? (model.shareByItem.get(d.gradeItemId) ?? null) : null,
    grade: d.gradeItemId !== null ? (progress.gradeByItem.get(d.gradeItemId) ?? null) : null,
  }));

  return {
    deadlines,
    weights: {
      courseId,
      rawTotal: model.rawTotal,
      status: model.status,
      missing: model.missing,
      gradeSoFar: progress.gradeSoFar,
      releasedWeight: progress.releasedWeight,
    },
  };
}

export async function runSync(
  c: D2LClient,
  prev: Pick<Store, "selectedCourseIds" | "manualGradeLinks">,
  now: Date = new Date(),
  origin: string = D2L_ORIGIN,
): Promise<SyncResult> {
  const versions = await api.getVersions(c);
  if (!versions) throw new NoApiVersionsError();
  const { lp, le } = versions;

  const who = await optional(api.getWhoAmI(c, lp), null);
  const user: User | null = who ? { firstName: who.FirstName } : null;

  const [courses, enrollments] = await Promise.all([
    api.getCourses(c),
    optional(api.getEnrollments(c, lp), []),
  ]);
  const candidates = buildCandidates(courses, enrollments, now);

  // Until the student confirms the picker, only the course list is fetched.
  if (prev.selectedCourseIds === null) return { user, candidates, deadlines: [], weights: [] };

  const available = new Set(candidates.map((x) => x.id));
  const selected = prev.selectedCourseIds.filter((id) => available.has(id));
  if (!selected.length) return { user, candidates, deadlines: [], weights: [] };

  const from = new Date(now.getTime() - EVENTS_PAST_DAYS * 864e5);
  const to = new Date(now.getTime() + EVENTS_AHEAD_DAYS * 864e5);
  const rawEvents = await optional(api.getCalendarEvents(c, le, selected, from, to), []);
  const events = eventsToDeadlines(rawEvents, origin);

  const perCourse = await mapLimit(selected, 2, (id) =>
    syncCourse(c, le, id, events.filter((e) => e.courseId === id), prev.manualGradeLinks),
  );

  return {
    user,
    candidates,
    deadlines: perCourse.flatMap((r) => r.deadlines).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)),
    weights: perCourse.map((r) => r.weights),
  };
}
