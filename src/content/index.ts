// Runs on d2l.ucalgary.ca pages. Decides when to sync, runs it, and saves
// the result. The popup asks for a sync by setting `pendingSync`.

import { SignedOutError, createClient } from "../d2l/api";
import { NoApiVersionsError, runSync } from "../d2l/sync";
import { patchStore, readStore } from "../shared/storage";
import type { SyncErrorCode } from "../types";

const STALE_AFTER_MS = 30 * 60 * 1000;
// Another D2L tab may be syncing; after this long we assume it was closed.
const LOCK_TIMEOUT_MS = 2 * 60 * 1000;

function errorCode(e: unknown): SyncErrorCode {
  if (e instanceof NoApiVersionsError) return "noApiVersions";
  if (e instanceof TypeError) return "network"; // fetch rejects with TypeError when offline
  return "d2lError";
}

async function sync(force: boolean) {
  const store = await readStore();
  const now = Date.now();
  const { sync: state } = store;
  if (state.status === "syncing" && state.startedAt && now - state.startedAt < LOCK_TIMEOUT_MS) return;
  if (!force && state.lastSyncedAt && now - state.lastSyncedAt < STALE_AFTER_MS) return;

  await patchStore({ pendingSync: false, sync: { ...state, status: "syncing", startedAt: now, error: null } });
  try {
    const result = await runSync(createClient(), store);
    await patchStore({
      ...result,
      sync: { status: "idle", startedAt: null, lastSyncedAt: Date.now(), error: null },
    });
  } catch (e) {
    const signedOut = e instanceof SignedOutError;
    // Keep the last good data; only the status changes.
    await patchStore({
      sync: {
        status: signedOut ? "signedOut" : "error",
        startedAt: null,
        lastSyncedAt: state.lastSyncedAt,
        error: signedOut ? null : errorCode(e),
      },
    });
    if (!signedOut) console.warn("[DinoDue] sync failed", e);
  }
}

readStore().then((s) => sync(s.pendingSync));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.pendingSync?.newValue === true) void sync(true);
});
