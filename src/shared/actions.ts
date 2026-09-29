// Things the popup asks for. Syncing itself happens in the content script on
// a D2L page (it has the student's session), so the popup just sets a flag.

import { D2L_ORIGIN } from "../types";
import { patchStore } from "./storage";

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
