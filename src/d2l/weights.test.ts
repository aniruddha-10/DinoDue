import { describe, expect, it } from "vitest";
import type { RawGradeCategory, RawGradeObject, RawGradeValue } from "./api";
import { buildWeights, gradeProgress } from "./weights";

const WEIGHTED = { GradingSystem: "Weighted" };
const item = (Id: number, Weight: number | null, extra: Partial<RawGradeObject> = {}): RawGradeObject => ({
  Id,
  Name: `Item ${Id}`,
  GradeType: "Numeric",
  CategoryId: 0,
  Weight,
  ...extra,
});
const category = (Id: number, Weight: number, extra: Partial<RawGradeCategory> = {}): RawGradeCategory => ({
  Id,
  Name: `Category ${Id}`,
  Weight,
  ...extra,
});

describe("buildWeights", () => {
  it("scales a gradebook that adds to 140 (probe course 1) and treats category items as course-level", () => {
    // One 23% category holding 12 items that add to 23, plus loose items adding to 117.
    const inCat = Array.from({ length: 12 }, (_, i) => item(100 + i, i < 11 ? 2 : 1, { CategoryId: 9 }));
    const loose = [item(1, 14), item(2, 28), item(3, 35), item(4, 40)];
    const m = buildWeights(WEIGHTED, [...inCat, ...loose], [category(9, 23)]);

    expect(m.rawTotal).toBe(140);
    expect(m.status).toBe("scaled");
    expect(m.shareByItem.get(1)).toBe(10);          // 14 of 140
    expect(m.shareByItem.get(100)).toBe(1.43);      // 2 of 140, not 2% of the 23% category
    const total = [...m.shareByItem.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100, 0);
  });

  it("flags a gradebook that adds to 80 (probe course 2) as partial and ignores bonus items", () => {
    const m = buildWeights(WEIGHTED, [item(1, 20), item(2, 20), item(3, 20), item(4, 20), item(5, 10, { IsBonus: true })], []);
    expect(m).toMatchObject({ status: "partial", rawTotal: 80, missing: 20 });
    expect(m.shareByItem.get(1)).toBe(20);
    expect(m.shareByItem.has(5)).toBe(false);
  });

  it("converts category-relative weights to course-level", () => {
    const m = buildWeights(
      WEIGHTED,
      [item(1, 50, { CategoryId: 9 }), item(2, 50, { CategoryId: 9 }), item(3, 60)],
      [category(9, 40)],
    );
    expect(m.status).toBe("exact");
    expect(m.shareByItem.get(1)).toBe(20);
    expect(m.shareByItem.get(3)).toBe(60);
  });

  it("splits a category evenly when its items have no weights", () => {
    const m = buildWeights(WEIGHTED, [item(1, null, { CategoryId: 9 }), item(2, null, { CategoryId: 9 }), item(3, 70)], [category(9, 30)]);
    expect(m.shareByItem.get(1)).toBe(15);
  });

  it("skips excluded categories and excluded items", () => {
    const m = buildWeights(
      WEIGHTED,
      [item(1, 10, { CategoryId: 9 }), item(2, 100), item(3, 50, { ExcludeFromFinalGradeCalculation: true })],
      [category(9, 10, { ExcludeFromFinalGrade: true })],
    );
    expect(m.status).toBe("exact");
    expect([...m.shareByItem.keys()]).toEqual([2]);
  });

  it("returns 'none' for non-weighted gradebooks or no setup", () => {
    expect(buildWeights({ GradingSystem: "Points" }, [item(1, 50)], []).status).toBe("none");
    expect(buildWeights(null, [item(1, 50)], []).status).toBe("none");
  });
});

describe("gradeProgress", () => {
  const value = (id: number, num: number | null, den: number | null, type = "Numeric"): RawGradeValue => ({
    GradeObjectIdentifier: String(id),
    GradeObjectType: 1,
    GradeObjectTypeName: type,
    PointsNumerator: num,
    PointsDenominator: den,
    WeightedNumerator: null,
    WeightedDenominator: null,
    DisplayedGrade: num === null ? null : `${num} / ${den}`,
  });

  it("averages over released items only, weighted by share", () => {
    const shares = new Map([[1, 10], [2, 30], [3, 60]]);
    const p = gradeProgress([value(1, 10, 10), value(2, 15, 20), value(3, null, 100)], shares);
    expect(p.releasedWeight).toBe(40);
    expect(p.gradeSoFar).toBe(81.25); // (10*1 + 30*0.75) / 40
    expect(p.gradeByItem.get(2)).toEqual({ points: 15, outOf: 20, display: "15 / 20" });
  });

  it("ignores category and final-grade rows that aren't weighted items", () => {
    const p = gradeProgress([value(1, 8, 10), value(77, 90, 100, "Category")], new Map([[1, 50]]));
    expect(p.releasedWeight).toBe(50);
    expect(p.gradeSoFar).toBe(80);
  });

  it("returns null when nothing is released", () => {
    expect(gradeProgress([], new Map([[1, 50]])).gradeSoFar).toBeNull();
  });
});
