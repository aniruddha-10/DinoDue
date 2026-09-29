import { describe, expect, it } from "vitest";
import { dueParts, percent, relativeTime } from "./format";

// Local times; vitest.config sets TZ=America/Edmonton so these are stable.
const NOW = new Date(2026, 8, 28, 12, 0); // Mon Sep 28 2026, noon

describe("dueParts", () => {
  it("says today and tomorrow by calendar day, not 24-hour windows", () => {
    expect(dueParts(new Date(2026, 8, 28, 23, 59).toISOString(), NOW, "en-US")).toEqual({ kind: "today", time: "11:59 PM" });
    expect(dueParts(new Date(2026, 8, 29, 0, 30).toISOString(), NOW, "en-US")).toEqual({ kind: "tomorrow", time: "12:30 AM" });
  });

  it("uses the weekday within a week and the date after that", () => {
    expect(dueParts(new Date(2026, 8, 30, 18, 0).toISOString(), NOW, "en-US")).toEqual({ kind: "date", text: "Wed 6:00 PM" });
    expect(dueParts(new Date(2026, 9, 20, 18, 0).toISOString(), NOW, "en-US")).toEqual({ kind: "date", text: "Oct 20, 6:00 PM" });
  });

  it("follows the locale", () => {
    const p = dueParts(new Date(2026, 9, 20, 18, 0).toISOString(), NOW, "fr-CA");
    expect(p.kind === "date" && p.text).toMatch(/20 oct/);
  });
});

describe("percent", () => {
  it("formats weights with at most one decimal", () => {
    expect(percent(25, "en-US")).toBe("25%");
    expect(percent(1.43, "en-US")).toBe("1.4%");
    expect(percent(12.5, "fr-CA")).toMatch(/12,5\s%/);
  });
});

describe("relativeTime", () => {
  const t = NOW.getTime();
  it("rounds to the nearest sensible unit", () => {
    expect(relativeTime(t - 20_000, t, "en-US")).toBe("now");
    expect(relativeTime(t - 5 * 60_000, t, "en-US")).toBe("5 minutes ago");
    expect(relativeTime(t - 3 * 3600_000, t, "en-US")).toBe("3 hours ago");
    expect(relativeTime(t - 26 * 3600_000, t, "en-US")).toBe("yesterday");
  });
});
