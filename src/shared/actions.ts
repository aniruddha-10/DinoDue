// Things the popup and forecast page ask for. Syncing itself happens in the
// content script on a D2L page (it has the student's session), so the pages
// just set a flag.

import { D2L_ORIGIN, type ReminderSettings } from "../types";
import { t } from "./i18n";
import { applyManualLinks } from "./links";
import { patchStore, readStore } from "./storage";

const HOME = `${D2L_ORIGIN}/d2l/home`;

export function openD2L(path = "/d2l/home") {
  const url = new URL(path, D2L_ORIGIN);
  if (url.origin !== D2L_ORIGIN) return;
  void chrome.tabs.create({ url: url.href });
}

// If no D2L page is open, open one in the background so the sync can run.
export async function requestSync() {
  await patchStore({ pendingSync: true });
  const tabs = await chrome.tabs.query({ url: `${D2L_ORIGIN}/d2l/*` });
  if (!tabs.length) await chrome.tabs.create({ url: HOME, active: false });
}

export async function saveCourses(ids: number[]) {
  await patchStore({ selectedCourseIds: ids });
  await requestSync();
}

export function openForecast() {
  void chrome.tabs.create({ url: chrome.runtime.getURL("forecast.html") });
}

// The student's own deadline -> gradebook choice (null = "not graded").
// Applied to the stored deadlines right away, and by every later sync.
export async function setGradeLink(deadlineId: string, gradeItemId: number | null) {
  const store = await readStore();
  const manualGradeLinks = { ...store.manualGradeLinks, [deadlineId]: gradeItemId };
  await patchStore({
    manualGradeLinks,
    deadlines: applyManualLinks(store.deadlines, store.gradeItems, manualGradeLinks),
  });
}

export async function setEventsHidden(courseId: number, hidden: boolean) {
  const store = await readStore();
  const ids = new Set(store.hiddenEventCourseIds);
  if (hidden) ids.add(courseId);
  else ids.delete(courseId);
  await patchStore({ hiddenEventCourseIds: [...ids] });
}

export async function setReminders(settings: ReminderSettings) {
  await patchStore({ reminders: { enabled: settings.enabled, leadsHours: [...settings.leadsHours].sort((a, b) => b - a) } });
}

// A sample notification, so students can check Chrome and macOS let it through.
export function sendTestReminder() {
  void chrome.notifications.create("test", {
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title: t("testTitle"),
    message: t("testBody"),
  });
}

// "granted" or "denied" (Chrome-level only; macOS can still block Chrome).
export function notificationPermission(): Promise<string> {
  return new Promise((resolve) => chrome.notifications.getPermissionLevel((level) => resolve(level)));
}
