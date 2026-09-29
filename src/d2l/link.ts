// Ties each deadline to its gradebook entry, so it can show its weight and
// grade. How often D2L links them itself varies by instructor (the probes saw
// 1 of 10 in one course, every item in two others), so we fall back to names.
//
// Order: the student's own choice > D2L's link > exact name > close name.
// "fuzzy" links are surfaced in the UI for the student to confirm.

import type { Deadline, GradeLink } from "../types";
import type { RawGradeObject } from "./api";

const FUZZY_MIN = 0.5;

export const normalizeName = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function similarity(a: string, b: string): number {
  const x = new Set(normalizeName(a).split(" ").filter(Boolean));
  const y = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter++;
  return inter / (x.size + y.size - inter);
}

// `deadlines` and `gradeItems` must belong to the same course.
export function linkGradeItems(
  deadlines: Deadline[],
  gradeItems: RawGradeObject[],
  manual: Record<string, number | null>,
): Deadline[] {
  const byId = new Map(gradeItems.map((g) => [g.Id, g]));
  const result = new Map<string, { gradeItemId: number | null; gradeLink: GradeLink | null }>();
  const claimed = new Set<number>();

  // Pass 1: choices that don't depend on names.
  for (const d of deadlines) {
    if (d.id in manual) {
      const id = manual[d.id];
      const valid = id !== null && byId.has(id);
      result.set(d.id, { gradeItemId: valid ? id : null, gradeLink: "manual" });
      if (valid) claimed.add(id);
    } else if (d.gradeItemId !== null && byId.has(d.gradeItemId)) {
      result.set(d.id, { gradeItemId: d.gradeItemId, gradeLink: "d2l" });
      claimed.add(d.gradeItemId);
    }
  }

  // Pass 2: exact names, then close names, among grade items not yet taken.
  const open = () => gradeItems.filter((g) => !claimed.has(g.Id));
  for (const d of deadlines) {
    if (result.has(d.id)) continue;
    const name = normalizeName(d.title);
    const exact = open().filter((g) => normalizeName(g.Name) === name || normalizeName(g.ShortName) === name);
    if (exact.length === 1) {
      result.set(d.id, { gradeItemId: exact[0].Id, gradeLink: "name" });
      claimed.add(exact[0].Id);
    }
  }
  for (const d of deadlines) {
    if (result.has(d.id)) continue;
    const scored = open()
      .map((g) => ({ g, s: similarity(d.title, g.Name) }))
      .sort((a, b) => b.s - a.s);
    const [best, second] = scored;
    // Only when there's one clear winner; ties are left for the student.
    if (best && best.s >= FUZZY_MIN && (!second || best.s > second.s)) {
      result.set(d.id, { gradeItemId: best.g.Id, gradeLink: "fuzzy" });
      claimed.add(best.g.Id);
    }
  }

  return deadlines.map((d) => ({ ...d, ...(result.get(d.id) ?? { gradeItemId: null, gradeLink: null }) }));
}
