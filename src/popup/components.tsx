import { useState, type CSSProperties } from "react";
import { courseColor } from "../shared/colors";
import type { Outlook } from "../shared/forecast";
import { dueParts, percent } from "../shared/format";
import { t, uiLocale, type MessageKey } from "../shared/i18n";
import { openD2L, openForecast, saveCourses } from "../shared/actions";
import { currentTerm, shortCourseCode } from "../d2l/normalize";
import type { CourseCandidate, Deadline, Store, SuggestReason } from "../types";
import { CheckIcon, ChevronIcon, CloudIcon, StormIcon, SunIcon, WindIcon } from "./Icons";

const TERM_KEYS: Record<string, MessageKey> = {
  fall: "termFall",
  winter: "termWinter",
  spring: "termSpring",
  summer: "termSummer",
};

export const courseLabel = (c: CourseCandidate | undefined) => shortCourseCode(c?.code ?? null) || c?.name || "";

// ---- Header ----

export function Header({ now }: { now: Date }) {
  const term = currentTerm(now);
  return (
    <header className="header">
      <div className="header-bar">
        <div className="brand">
          <WindIcon size={20} />
          <span className="brand-name">{t("extName")}</span>
        </div>
        <span className="term">{t(TERM_KEYS[term.season], term.year)}</span>
      </div>
      <Tartan />
    </header>
  );
}

// A thin strip in the spirit of UCalgary's red-and-gold tartan.
function Tartan() {
  const posts = [20, 60, 100, 140, 180, 220, 260, 300, 340];
  return (
    <svg className="tartan" viewBox="0 0 360 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect width="360" height="8" fill="#9C0534" />
      <rect y="2" width="360" height="2" fill="#FFCD00" />
      <rect y="5" width="360" height="1" fill="#1a1a1a" />
      {posts.map((x, i) =>
        i % 2 ? (
          <rect key={x} x={x} width="1" height="8" fill="#1a1a1a" opacity="0.55" />
        ) : (
          <rect key={x} x={x} width="3" height="8" fill="#FFCD00" opacity="0.55" />
        ),
      )}
    </svg>
  );
}

// ---- Status banner ----

const LOCK_STALE_MS = 2 * 60 * 1000;

export function Banner({ store, now }: { store: Store; now: Date }) {
  const { sync } = store;
  const syncing = sync.status === "syncing" && sync.startedAt !== null && now.getTime() - sync.startedAt < LOCK_STALE_MS;

  let key: MessageKey | null = null;
  let tone: "info" | "warn" = "info";
  let action = false;
  if (syncing) key = "bannerSyncing";
  else if (sync.status === "signedOut") [key, tone, action] = ["bannerSignedOut", "warn", true];
  else if (sync.status === "error") {
    tone = "warn";
    key = sync.error === "network" ? "bannerErrorNetwork" : sync.error === "noApiVersions" ? "bannerErrorVersions" : "bannerErrorD2L";
  } else if (store.pendingSync) key = "bannerWaiting";
  if (!key) return null;

  return (
    <div className={`banner banner-${tone}`} role="status">
      {syncing && <span className="spinner" aria-hidden="true" />}
      <span>{t(key)}</span>
      {action && (
        <button type="button" className="link-btn" onClick={() => openD2L()}>
          {t("openD2L")}
        </button>
      )}
    </div>
  );
}

// ---- First run ----

export function Welcome({ store }: { store: Store }) {
  const synced = store.sync.lastSyncedAt !== null;
  return (
    <section className="welcome">
      {synced ? (
        <p className="muted">{t("pickerEmpty")}</p>
      ) : (
        <>
          <h1 className="slab welcome-title">{t("welcomeTitle")}</h1>
          <p className="muted">{t("welcomeBody")}</p>
        </>
      )}
      <button type="button" className="primary-btn" onClick={() => openD2L()}>
        {t("openD2L")}
      </button>
    </section>
  );
}

// ---- Course picker ----

const REASON_KEYS: Record<SuggestReason, MessageKey> = {
  dates: "reasonDates",
  termInName: "reasonTermInName",
  recentlyOpened: "reasonRecentlyOpened",
};

export function Picker({ store, onDone }: { store: Store; onDone: () => void }) {
  const { candidates } = store;
  const [selected, setSelected] = useState(
    () => new Set(store.selectedCourseIds ?? candidates.filter((c) => c.suggested).map((c) => c.id)),
  );
  const [error, setError] = useState(false);

  const toggle = (id: number) => {
    setError(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!selected.size) return setError(true);
    // Keep the picker's order so course colours are stable.
    await saveCourses(candidates.filter((c) => selected.has(c.id)).map((c) => c.id));
    onDone();
  };

  const suggested = candidates.filter((c) => c.suggested);
  const others = candidates.filter((c) => !c.suggested);
  const group = (title: MessageKey, list: CourseCandidate[]) =>
    list.length > 0 && (
      <fieldset className="pick-group">
        <legend className="section-title">{t(title)}</legend>
        {list.map((c) => (
          <label key={c.id} className="pick-row">
            <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
            <span className="pick-text">
              <span className="pick-name">{c.name}</span>
              {c.code && c.code !== c.name && <span className="pick-code">{shortCourseCode(c.code)}</span>}
            </span>
            {c.reason && <span className="chip">{t(REASON_KEYS[c.reason])}</span>}
          </label>
        ))}
      </fieldset>
    );

  return (
    <section className="picker">
      <h1 className="slab picker-title">{t("pickerTitle")}</h1>
      <p className="muted picker-body">{t("pickerBody")}</p>
      <div className="pick-list">
        {group("pickerSuggested", suggested)}
        {group("pickerOther", others)}
      </div>
      <div className="picker-footer">
        <span className={error ? "error-text" : "muted"} role={error ? "alert" : undefined}>
          {error
            ? t("pickerNoneSelected")
            : selected.size === 1
              ? t("pickerSelectedOne")
              : t("pickerSelectedOther", selected.size)}
        </span>
        <div className="picker-actions">
          {store.selectedCourseIds !== null && (
            <button type="button" className="ghost-btn" onClick={onDone}>
              {t("cancel")}
            </button>
          )}
          <button type="button" className="primary-btn" onClick={save}>
            {t("pickerSave")}
          </button>
        </div>
      </div>
    </section>
  );
}

// ---- Forecast ----

const WEATHER = {
  storm: { key: "forecastStorm", Icon: StormIcon },
  cloudy: { key: "forecastCloudy", Icon: CloudIcon },
  clear: { key: "forecastClear", Icon: SunIcon },
} as const;

export function ForecastCard({ outlook }: { outlook: Outlook }) {
  const { key, Icon } = WEATHER[outlook.weather];
  const locale = uiLocale();
  const due =
    outlook.count === 0 ? t("forecastNoneDue") : outlook.count === 1 ? t("forecastDueOne") : t("forecastDueOther", outlook.count);
  return (
    <button
      type="button"
      className={`forecast forecast-${outlook.weather}`}
      onClick={openForecast}
      title={t("openForecast")}
    >
      <Icon size={26} className="forecast-icon" />
      <span className="forecast-text">
        <span className="slab forecast-title">{t(key)}</span>
        <span className="forecast-detail">{due}</span>
        {outlook.stake > 0 && <span className="forecast-detail">{t("forecastStake", percent(outlook.stake, locale))}</span>}
      </span>
      <ChevronIcon size={18} className="forecast-chevron" />
      <span className="sr-only">{t("openForecast")}</span>
    </button>
  );
}

// ---- Deadlines ----

function dueText(d: Deadline, now: Date, locale: string) {
  const p = dueParts(d.dueAt, now, locale);
  if (p.kind === "today") return t("dueToday", p.time);
  if (p.kind === "tomorrow") return t("dueTomorrow", p.time);
  return p.text;
}

function Badge({ d, locale }: { d: Deadline; locale: string }) {
  if (d.grade?.display) return <span className="grade-badge">{d.grade.display}</span>;
  if (d.submitted === true) {
    return (
      <span className="done-badge">
        <CheckIcon size={14} />
        {t("submitted")}
      </span>
    );
  }
  if (d.weight === null) return null;
  const pct = percent(d.weight, locale);
  const fuzzy = d.gradeLink === "fuzzy";
  return (
    <span
      className={fuzzy ? "weight-badge weight-fuzzy" : "weight-badge"}
      title={fuzzy ? t("weightFuzzy") : undefined}
      aria-label={t("weightOf", pct)}
    >
      {pct}
    </span>
  );
}

const KIND_KEYS: Record<Deadline["kind"], MessageKey> = {
  assignment: "kindAssignment",
  quiz: "kindQuiz",
  event: "kindEvent",
};

export function DeadlineList({
  title,
  items,
  empty,
  store,
  now,
  showKind = false,
}: {
  title?: string;
  items: Deadline[];
  empty?: MessageKey;
  store: Store;
  now: Date;
  showKind?: boolean;
}) {
  const locale = uiLocale();
  const courses = new Map(store.candidates.map((c) => [c.id, c]));
  const selected = store.selectedCourseIds ?? [];
  return (
    <section className="list">
      {title && <h2 className="section-title">{title}</h2>}
      {items.length === 0 && empty && <p className="muted list-empty">{t(empty)}</p>}
      <ul>
        {items.map((d) => {
          const color = courseColor(d.courseId, selected);
          const style = { "--bar": color.bar, "--ct": color.text, "--ctd": color.textDark } as CSSProperties;
          return (
            <li key={d.id}>
              <button
                type="button"
                className={d.submitted === true ? "row row-done" : "row"}
                style={style}
                onClick={() => d.url && openD2L(d.url)}
              >
                <span className="row-bar" aria-hidden="true" />
                <span className="row-main">
                  <span className="row-title">{d.title}</span>
                  <span className="row-meta">
                    <span className="row-code">{courseLabel(courses.get(d.courseId))}</span>
                    {" · "}
                    {dueText(d, now, locale)}
                    {showKind && (
                      <>
                        {" · "}
                        {t(KIND_KEYS[d.kind])}
                      </>
                    )}
                  </span>
                </span>
                <Badge d={d} locale={locale} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
