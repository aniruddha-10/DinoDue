// Turns a D2L gradebook into "what share of the final grade is each item".
//
// What the UCalgary probes showed (see probe/):
// - Gradebooks use the Weighted system.
// - An item's weight inside a category is already its share of the whole
//   course (items in a 23% category added up to 23), not a share of the
//   category.
// - Totals don't always come to 100: one course added to 140, another to 80.
//   D2L treats weights as proportions, so over 100 we scale down. Under 100
//   usually means part of the course (often the final exam) isn't in D2L yet,
//   so we keep the raw numbers and report what's missing.

import type { CourseWeights, Grade } from "../types";
import type { RawGradeCategory, RawGradeObject, RawGradeSetup, RawGradeValue } from "./api";

const TOLERANCE = 0.5;

export interface WeightModel {
  shareByItem: Map<number, number>; // grade item id -> percent of final grade
  status: CourseWeights["status"];
  rawTotal: number;
  missing: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildWeights(
  setup: RawGradeSetup | null,
  objects: RawGradeObject[],
  categories: RawGradeCategory[],
): WeightModel {
  const empty: WeightModel = { shareByItem: new Map(), status: "none", rawTotal: 0, missing: 0 };
  if (setup?.GradingSystem !== "Weighted") return empty;

  const counted = (o: RawGradeObject) => !o.IsBonus && !o.ExcludeFromFinalGradeCalculation;
  const catById = new Map(categories.map((c) => [c.Id, c]));
  const raw = new Map<number, number>();
  let rawTotal = 0;

  // Items outside any category (or in a category D2L didn't return).
  for (const o of objects) {
    if (!counted(o)) continue;
    if (o.CategoryId && catById.has(o.CategoryId)) continue;
    const w = o.Weight ?? 0;
    raw.set(o.Id, w);
    rawTotal += w;
  }

  for (const cat of categories) {
    if (cat.ExcludeFromFinalGrade) continue;
    const catWeight = cat.Weight ?? 0;
    rawTotal += catWeight;
    const inside = objects.filter((o) => counted(o) && o.CategoryId === cat.Id);
    if (!inside.length) continue;
    const insideSum = inside.reduce((s, o) => s + (o.Weight ?? 0), 0);
    for (const o of inside) {
      const w = o.Weight ?? 0;
      let share: number;
      if (Math.abs(insideSum - catWeight) <= TOLERANCE) share = w;        // already course-level
      else if (insideSum > 0) share = (w / insideSum) * catWeight;         // relative to the category
      else share = catWeight / inside.length;                              // no item weights: split evenly
      raw.set(o.Id, share);
    }
  }

  if (rawTotal <= 0) return empty;

  let status: WeightModel["status"];
  let scale = 1;
  if (Math.abs(rawTotal - 100) <= TOLERANCE) status = "exact";
  else if (rawTotal > 100) {
    status = "scaled";
    scale = 100 / rawTotal;
  } else status = "partial";

  const shareByItem = new Map([...raw].map(([id, w]) => [id, round2(w * scale)]));
  return {
    shareByItem,
    status,
    rawTotal: round2(rawTotal),
    missing: status === "partial" ? round2(100 - rawTotal) : 0,
  };
}

export interface GradeProgress {
  gradeByItem: Map<number, Grade>;
  gradeSoFar: number | null; // percent, over released items only
  releasedWeight: number;    // percent of the final grade that's been graded
}

// Uses our own shares (not D2L's WeightedDenominator) so the numbers agree
// with the weights shown on each deadline, including after scaling.
export function gradeProgress(values: RawGradeValue[], shareByItem: Map<number, number>): GradeProgress {
  const gradeByItem = new Map<number, Grade>();
  let released = 0;
  let earned = 0;

  for (const v of values) {
    const id = Number(v.GradeObjectIdentifier);
    if (!Number.isFinite(id)) continue;
    gradeByItem.set(id, { points: v.PointsNumerator, outOf: v.PointsDenominator, display: v.DisplayedGrade });

    const share = shareByItem.get(id);
    if (share === undefined || v.PointsNumerator == null || !v.PointsDenominator) continue;
    released += share;
    earned += share * (v.PointsNumerator / v.PointsDenominator);
  }

  return {
    gradeByItem,
    gradeSoFar: released > 0 ? round2((earned / released) * 100) : null,
    releasedWeight: round2(released),
  };
}
