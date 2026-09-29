import { useState } from "react";
import { requestSync } from "../shared/actions";
import { outlook, upNext, visibleDeadlines } from "../shared/forecast";
import { relativeTime } from "../shared/format";
import { t, uiLocale } from "../shared/i18n";
import { useNow, useStore } from "../shared/useStore";
import type { Store } from "../types";
import { Banner, DeadlineList, ForecastCard, Header, Picker, Welcome } from "./components";
import { RefreshIcon } from "./Icons";

export function Popup() {
  const store = useStore();
  const now = useNow();
  const [picking, setPicking] = useState(false);
  if (!store) return null;

  const showPicker = store.selectedCourseIds === null || picking;
  let body;
  if (!showPicker) body = <Main store={store} now={now} onChangeCourses={() => setPicking(true)} />;
  else if (store.candidates.length) body = <Picker store={store} onDone={() => setPicking(false)} />;
  else body = <Welcome store={store} />;

  return (
    <div className="popup">
      <Header now={now} />
      <Banner store={store} now={now} />
      {body}
    </div>
  );
}

function Main({ store, now, onChangeCourses }: { store: Store; now: Date; onChangeCourses: () => void }) {
  const visible = visibleDeadlines(store.deadlines, store.hiddenEventCourseIds);
  const { soon, later } = upNext(visible, now);
  const synced = store.sync.lastSyncedAt;

  return (
    <>
      <ForecastCard outlook={outlook(visible, now)} />
      <DeadlineList title={t("sectionUpNext")} items={soon} empty="emptyUpNext" store={store} now={now} />
      {later.length > 0 && <DeadlineList title={t("sectionLater")} items={later} store={store} now={now} />}
      <footer className="footer">
        <span className="muted footer-status">
          {synced ? t("lastSynced", relativeTime(synced, now.getTime(), uiLocale())) : t("neverSynced")}
        </span>
        <button type="button" className="ghost-btn" onClick={onChangeCourses}>
          {t("changeCourses")}
        </button>
        <button type="button" className="ghost-btn" onClick={() => void requestSync()}>
          <RefreshIcon size={16} />
          {t("syncNow")}
        </button>
      </footer>
    </>
  );
}
