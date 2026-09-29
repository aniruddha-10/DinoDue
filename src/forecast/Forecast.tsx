import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { notificationPermission, sendTestReminder, setEventsHidden, setGradeLink, setReminders } from "../shared/actions";
import { courseColor } from "../shared/colors";
import { visibleDeadlines } from "../shared/forecast";
import { needsReview } from "../shared/links";
import { dueParts, percent } from "../shared/format";
import { t, uiLocale, type MessageKey } from "../shared/i18n";
import { buildWeeks, termRange } from "../shared/skyline";
import { useNow, useStore } from "../shared/useStore";
import type { CourseWeights, Store } from "../types";
import { DeadlineList, Header, courseLabel } from "../popup/components";
import { Skyline, weekLabel, weekSummary } from "./Skyline";

export function Forecast() {
  const store = useStore();
  const now = useNow();
  if (!store) return null;

  const hasData = store.selectedCourseIds !== null && store.selectedCourseIds.length > 0;
  return (
    <>
      <Header now={now} />
      <main className="page">
        <h1 className="slab page-title">{t("forecastPageTitle")}</h1>
        {hasData ? <Body store={store} now={now} /> : <p className="muted">{t("forecastEmpty")}</p>}
        <p className="muted disclaimer">{t("notAffiliated")}</p>
      </main>
    </>
  );
}

function Body({ store, now }: { store: Store; now: Date }) {
  const locale = uiLocale();
  const selectedIds = store.selectedCourseIds ?? [];
  const courses = store.candidates.filter((c) => selectedIds.includes(c.id));
  const visible = visibleDeadlines(store.deadlines, store.hiddenEventCourseIds);

  const weeks = useMemo(
    () => buildWeeks(visible, termRange(courses, visible, now), now),
    // Recompute when the data or the day changes, not on every minute tick.
    [store.deadlines, store.hiddenEventCourseIds, store.selectedCourseIds, now.toDateString()],
  );
  const currentIndex = Math.max(0, weeks.findIndex((w) => w.isCurrent));
  const [selected, setSelected] = useState(currentIndex);
  const week = weeks[Math.min(selected, weeks.length - 1)];

  return (
    <>
      <section className="card">
        <Skyline weeks={weeks} selected={selected} onSelect={setSelected} />
        <p className="muted caption">{t("skylineCaption")}</p>
      </section>

      <div className="columns">
        <section className="card week-card" aria-live="polite">
          {week && (
            <>
              <h2 className="slab card-title">{weekLabel(week, locale)}</h2>
              <p className="muted week-sub">{weekSummary(week, locale)}</p>
              <DeadlineList items={week.items} empty="weekEmpty" store={store} now={now} showKind />
            </>
          )}
        </section>

        <div className="stack">
        <section className="card">
          <h2 className="slab card-title">{t("coursesTitle")}</h2>
          <ul className="course-list">
            {courses.map((c) => (
              <CourseSummary
                key={c.id}
                store={store}
                courseId={c.id}
                label={courseLabel(c)}
                name={c.name}
                weights={store.weights.find((w) => w.courseId === c.id)}
              />
            ))}
          </ul>
        </section>
        <Reminders store={store} />
        </div>
      </div>

      <MatchReview store={store} now={now} />
    </>
  );
}

// ---- Courses ----

function weightsLine(w: CourseWeights | undefined, locale: string): string {
  if (!w || w.status === "none") return t("weightsNone");
  if (w.status === "exact") return t("weightsExact");
  if (w.status === "scaled") return t("weightsScaled", percent(w.rawTotal, locale));
  return t("weightsPartial", percent(w.missing, locale));
}

function CourseSummary({
  store,
  courseId,
  label,
  name,
  weights,
}: {
  store: Store;
  courseId: number;
  label: string;
  name: string;
  weights: CourseWeights | undefined;
}) {
  const locale = uiLocale();
  const color = courseColor(courseId, store.selectedCourseIds ?? []);
  const style = { "--bar": color.bar, "--ct": color.text, "--ctd": color.textDark } as CSSProperties;
  const hasEvents = store.deadlines.some((d) => d.kind === "event" && d.courseId === courseId);
  const eventsShown = !store.hiddenEventCourseIds.includes(courseId);

  return (
    <li className="course" style={style}>
      <span className="row-bar" aria-hidden="true" />
      <div className="course-main">
        <p className="course-head">
          <span className="row-code">{label}</span>
          {label !== name && <span className="muted course-name">{name}</span>}
        </p>
        <p className="course-line">{weightsLine(weights, locale)}</p>
        <p className="course-line">
          {weights?.gradeSoFar != null
            ? t("gradeSoFar", percent(weights.gradeSoFar, locale), percent(weights.releasedWeight, locale))
            : t("gradeNone")}
        </p>
        {hasEvents && (
          <label className="toggle">
            <input type="checkbox" checked={eventsShown} onChange={(e) => void setEventsHidden(courseId, !e.target.checked)} />
            {t("showEvents")}
          </label>
        )}
      </div>
    </li>
  );
}

// ---- Weight matches ----

const LINK_TAGS: Record<string, MessageKey> = { fuzzy: "matchFuzzy", none: "matchNone", manual: "matchManual" };

function MatchReview({ store, now }: { store: Store; now: Date }) {
  const locale = uiLocale();
  const list = needsReview(store);
  const courses = new Map(store.candidates.map((c) => [c.id, c]));

  return (
    <section className="card">
      <h2 className="slab card-title">{t("matchesTitle")}</h2>
      {list.length === 0 ? (
        <p className="muted">{t("matchesDone")}</p>
      ) : (
        <>
          <p className="muted matches-body">{t("matchesBody")}</p>
          <ul className="match-list">
            {list.map((d) => {
              const items = store.gradeItems
                .filter((g) => g.courseId === d.courseId)
                .sort((a, b) => a.name.localeCompare(b.name, locale, { numeric: true }));
              const tag = d.gradeLink === "manual" ? "manual" : d.gradeLink === "fuzzy" ? "fuzzy" : "none";
              const value = d.gradeItemId !== null ? String(d.gradeItemId) : d.gradeLink === "manual" ? "none" : "";
              const due = dueParts(d.dueAt, now, locale);
              const color = courseColor(d.courseId, store.selectedCourseIds ?? []);
              const style = { "--ct": color.text, "--ctd": color.textDark } as CSSProperties;
              return (
                <li key={d.id} className="match" style={style}>
                  <div className="match-main">
                    <p className="row-title">{d.title}</p>
                    <p className="row-meta">
                      <span className="row-code">{courseLabel(courses.get(d.courseId))}</span>
                      {" · "}
                      {due.kind === "date" ? due.text : t(due.kind === "today" ? "dueToday" : "dueTomorrow", due.time)}
                    </p>
                  </div>
                  <span className={`chip chip-${tag}`}>{t(LINK_TAGS[tag])}</span>
                  <select
                    aria-label={t("matchSelectLabel", d.title)}
                    value={value}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v) void setGradeLink(d.id, v === "none" ? null : Number(v));
                    }}
                  >
                    {value === "" && (
                      <option value="" disabled>
                        {t("matchChoose")}
                      </option>
                    )}
                    <option value="none">{t("matchNotGraded")}</option>
                    {items.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.weight !== null ? t("matchOption", g.name, percent(g.weight, locale)) : g.name}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

// ---- Reminders ----

const LEADS: { hours: number; key: MessageKey }[] = [
  { hours: 48, key: "remindLead48" },
  { hours: 24, key: "remindLead24" },
  { hours: 3, key: "remindLead3" },
];

function Reminders({ store }: { store: Store }) {
  const { reminders } = store;
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    void notificationPermission().then((level) => setDenied(level !== "granted"));
  }, []);

  const toggleLead = (hours: number, on: boolean) => {
    const leads = new Set(reminders.leadsHours);
    if (on) leads.add(hours);
    else leads.delete(hours);
    void setReminders({ ...reminders, leadsHours: [...leads] });
  };

  return (
    <section className="card">
      <h2 className="slab card-title">{t("remindersTitle")}</h2>
      <label className="toggle toggle-main">
        <input
          type="checkbox"
          checked={reminders.enabled}
          onChange={(e) => void setReminders({ ...reminders, enabled: e.target.checked })}
        />
        {t("remindersEnabled")}
      </label>
      {reminders.enabled && (
        <fieldset className="lead-options">
          <legend className="sr-only">{t("remindersTitle")}</legend>
          {LEADS.map(({ hours, key }) => (
            <label key={hours} className="toggle">
              <input
                type="checkbox"
                checked={reminders.leadsHours.includes(hours)}
                onChange={(e) => toggleLead(hours, e.target.checked)}
              />
              {t(key)}
            </label>
          ))}
        </fieldset>
      )}
      {denied && (
        <p className="banner banner-warn reminders-denied" role="status">
          {t("remindersDenied")}
        </p>
      )}
      <p className="muted course-line reminders-note">{t("remindersNote")}</p>
      <button type="button" className="ghost-btn" onClick={sendTestReminder}>
        {t("remindersTest")}
      </button>
    </section>
  );
}
