// The term as a Rockies skyline: one peak per week, as tall as the share of
// final grades due that week. The red range is what's still to do, the pale
// range behind it what's already submitted. Snow caps mark storm weeks.

import { useEffect, useRef, type KeyboardEvent } from "react";
import { percent } from "../shared/format";
import { t, uiLocale } from "../shared/i18n";
import type { Week } from "../shared/skyline";

const COL = 64;
const MIN_COL = 46; // below this the labels get too small, so the chart scrolls instead
const BASE = 150;
const MAX_H = 118;
const MIN_H = 3;
const SCALE_FLOOR = 30; // a 30% week always reaches the top, so light terms don't look dramatic

export function weekSummary(w: Week, locale: string): string {
  if (!w.count) return t("weekNoneDue");
  const due = w.count === 1 ? t("weekDueOne") : t("weekDueOther", w.count);
  return w.weight > 0 ? t("weekSummary", due, t("weekStake", percent(w.weight, locale))) : due;
}

export const weekLabel = (w: Week, locale: string) =>
  t("weekOf", new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(w.start));

function ridge(heights: number[]): string {
  const pts: string[] = [`0,${BASE}`];
  heights.forEach((h, i) => {
    const cx = i * COL + COL / 2;
    pts.push(`${cx},${BASE - h}`);
    if (i < heights.length - 1) {
      const valley = Math.min(h, heights[i + 1]) * 0.35;
      pts.push(`${(i + 1) * COL},${BASE - valley}`);
    }
  });
  pts.push(`${heights.length * COL},${BASE}`);
  return pts.join(" ");
}

export function Skyline({ weeks, selected, onSelect }: { weeks: Week[]; selected: number; onSelect: (i: number) => void }) {
  const locale = uiLocale();
  const scale = Math.max(SCALE_FLOOR, ...weeks.map((w) => w.weight));
  const height = (v: number) => (v > 0 ? Math.max(MIN_H * 2, (v / scale) * MAX_H) : MIN_H);
  const all = weeks.map((w) => height(w.weight));
  const todo = weeks.map((w) => height(w.todoWeight));
  const width = weeks.length * COL;
  const currentIndex = weeks.findIndex((w) => w.isCurrent);
  const short = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });

  // When the chart is wider than the window, open it on this week, not the
  // start of term.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el || el.scrollWidth <= el.clientWidth || currentIndex < 0) return;
    const col = el.scrollWidth / weeks.length;
    el.scrollLeft = Math.max(0, (currentIndex - 1) * col);
  }, [currentIndex, weeks.length]);

  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(i);
    } else if (e.key === "ArrowRight" && i < weeks.length - 1) {
      e.preventDefault();
      onSelect(i + 1);
      (e.currentTarget.nextElementSibling as SVGElement | null)?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      onSelect(i - 1);
      (e.currentTarget.previousElementSibling as SVGElement | null)?.focus();
    }
  };

  return (
    <div className="skyline-scroll" ref={scroller}>
      <svg
        className="skyline"
        viewBox={`0 0 ${width} 190`}
        style={{ minWidth: weeks.length * MIN_COL }}
        role="group"
        aria-label={t("forecastPageTitle")}
      >
        {currentIndex >= 0 && <rect className="sky-current" x={currentIndex * COL} y={0} width={COL} height={BASE} />}
        {weeks[selected] && (
          <rect className="sky-selected" x={selected * COL + 1} y={1} width={COL - 2} height={BASE + 42} rx={6} />
        )}

        <polygon className="sky-all" points={ridge(all)} />
        <polygon className="sky-todo" points={ridge(todo)} />

        {weeks.map((w, i) =>
          w.weather === "storm" && todo[i] >= 24 ? (
            <polygon
              key={`cap-${i}`}
              className="sky-snow"
              points={(() => {
                const cx = i * COL + COL / 2;
                const top = BASE - todo[i];
                return `${cx - 8},${top + 11} ${cx},${top} ${cx + 8},${top + 11} ${cx + 4},${top + 8} ${cx},${top + 12} ${cx - 4},${top + 8}`;
              })()}
            />
          ) : null,
        )}

        {currentIndex > 0 && <rect className="sky-past" x={0} y={0} width={currentIndex * COL} height={BASE} />}
        <line className="sky-base" x1={0} y1={BASE} x2={width} y2={BASE} />

        {weeks.map((w, i) => (
          <g key={`label-${i}`} aria-hidden="true">
            <text className={w.isCurrent ? "sky-label sky-label-current" : "sky-label"} x={i * COL + COL / 2} y={BASE + 16} textAnchor="middle">
              {short.format(w.start)}
            </text>
            {w.isCurrent ? (
              <text className="sky-note sky-note-current" x={i * COL + COL / 2} y={BASE + 31} textAnchor="middle">
                {t("weekThis")}
              </text>
            ) : w.weather === "storm" && !w.isPast ? (
              <text className="sky-note sky-note-storm" x={i * COL + COL / 2} y={BASE + 31} textAnchor="middle">
                {t("weatherStorm")}
              </text>
            ) : null}
          </g>
        ))}

        {weeks.map((w, i) => (
          <rect
            key={`hit-${i}`}
            className="sky-hit"
            x={i * COL}
            y={0}
            width={COL}
            height={190}
            role="button"
            tabIndex={i === selected ? 0 : -1}
            aria-pressed={i === selected}
            aria-label={t("weekAria", weekLabel(w, locale), weekSummary(w, locale))}
            onClick={() => onSelect(i)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <title>{t("weekAria", weekLabel(w, locale), weekSummary(w, locale))}</title>
          </rect>
        ))}
      </svg>
    </div>
  );
}
