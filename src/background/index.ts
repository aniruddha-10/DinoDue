// Background service worker: reminder notifications.
//
// Checks every 15 minutes (Chrome alarm) and whenever a sync writes new
// deadlines or the student changes reminder settings. Which reminders are due
// is decided in shared/reminders.ts; this file only shows them.

import { shortCourseCode } from "../d2l/normalize";
import { dueParts, percent } from "../shared/format";
import { t, uiLocale } from "../shared/i18n";
import { dueReminders, pruneSent, type Reminder } from "../shared/reminders";
import { patchStore, readStore } from "../shared/storage";
import { D2L_ORIGIN, type Store } from "../types";

const ALARM = "reminders";
const PERIOD_MINUTES = 15;
const GROUP_OVER = 2; // more than this at once -> one summary notification
const ICON = "icons/icon-128.png";
const DEADLINE_PREFIX = "dd:";

function whenText(iso: string, now: Date, locale: string): string {
  const p = dueParts(iso, now, locale);
  if (p.kind === "today") return t("whenToday", p.time);
  if (p.kind === "tomorrow") return t("whenTomorrow", p.time);
  return p.text;
}

function courseLabel(store: Store, courseId: number): string {
  const c = store.candidates.find((x) => x.id === courseId);
  return shortCourseCode(c?.code ?? null) || c?.name || "";
}

function show(store: Store, due: Reminder[], now: Date) {
  const locale = uiLocale();
  if (due.length > GROUP_OVER) {
    const first = due[0].deadline;
    void chrome.notifications.create(`sum:${now.getTime()}`, {
      type: "basic",
      iconUrl: ICON,
      title: t("notifySummaryTitle", due.length),
      message: t("notifySummaryBody", first.title, whenText(first.dueAt, now, locale)),
    });
    return;
  }
  for (const { deadline: d } of due) {
    const course = courseLabel(store, d.courseId);
    const when = whenText(d.dueAt, now, locale);
    void chrome.notifications.create(`${DEADLINE_PREFIX}${d.id}`, {
      type: "basic",
      iconUrl: ICON,
      title: d.title,
      message: d.weight !== null ? t("notifyBodyWeight", course, when, percent(d.weight, locale)) : t("notifyBody", course, when),
    });
  }
}

async function runCheck() {
  const store = await readStore();
  const now = new Date();
  const due = dueReminders(store.deadlines, store.hiddenEventCourseIds, store.reminders, store.remindersSent, now);
  const sent = pruneSent(store.remindersSent, store.deadlines, now);
  if (due.length) {
    show(store, due, now);
    for (const r of due) for (const k of r.keys) sent[k] = now.getTime();
  }
  // Only write when something changed. (This key doesn't retrigger a check.)
  if (JSON.stringify(sent) !== JSON.stringify(store.remindersSent)) await patchStore({ remindersSent: sent });
}

// One check at a time, so an alarm and a sync landing together can't both
// show the same reminder.
let queue: Promise<void> = Promise.resolve();
function check() {
  queue = queue.then(runCheck).catch((e) => console.warn("[DinoDue] reminder check failed", e));
}

async function ensureAlarm() {
  if (!(await chrome.alarms.get(ALARM))) await chrome.alarms.create(ALARM, { periodInMinutes: PERIOD_MINUTES });
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureAlarm();
  check();
});
chrome.runtime.onStartup.addListener(() => {
  void ensureAlarm();
  check();
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) check();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.deadlines || changes.reminders || changes.hiddenEventCourseIds)) check();
});

// Clicking a reminder opens that deadline in D2L; a summary opens the forecast.
chrome.notifications.onClicked.addListener(async (id) => {
  void chrome.notifications.clear(id);
  if (id.startsWith(DEADLINE_PREFIX)) {
    const store = await readStore();
    const d = store.deadlines.find((x) => x.id === id.slice(DEADLINE_PREFIX.length));
    if (d?.url) {
      const url = new URL(d.url, D2L_ORIGIN);
      if (url.origin === D2L_ORIGIN) return void chrome.tabs.create({ url: url.href });
    }
  }
  void chrome.tabs.create({ url: chrome.runtime.getURL("forecast.html") });
});

void ensureAlarm();
