// Applies the student's own deadline -> gradebook choices to stored
// deadlines, so a fix shows up immediately instead of after the next sync.
// The sync applies the same choices (d2l/link.ts); this keeps both in step.

import type { Deadline, GradeItemInfo, Store } from "../types";
import { visibleDeadlines } from "./forecast";

export function applyManualLinks(
  deadlines: Deadline[],
  gradeItems: GradeItemInfo[],
  manual: Record<string, number | null>,
): Deadline[] {
  const items = new Map(gradeItems.map((g) => [`${g.courseId}:${g.id}`, g]));
  return deadlines.map((d) => {
    if (!(d.id in manual)) return d;
    const id = manual[d.id];
    const item = id === null ? undefined : items.get(`${d.courseId}:${id}`);
    return {
      ...d,
      gradeItemId: item ? item.id : null,
      gradeLink: "manual",
      weight: item?.weight ?? null,
      grade: item?.grade ?? null,
    };
  });
}

// Deadlines worth checking on the forecast page: guessed by name, not found,
// or already set by the student (kept so their choice stays visible and
// changeable). Only in courses whose gradebook has weights.
export function needsReview(store: Pick<Store, "deadlines" | "hiddenEventCourseIds" | "weights">): Deadline[] {
  const weighted = new Set(store.weights.filter((w) => w.status !== "none").map((w) => w.courseId));
  return visibleDeadlines(store.deadlines, store.hiddenEventCourseIds)
    .filter((d) => weighted.has(d.courseId))
    .filter((d) => d.gradeLink === "fuzzy" || d.gradeLink === "manual" || d.gradeItemId === null)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}
