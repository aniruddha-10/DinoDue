// Typed access to chrome.storage.local. Each Store field is its own key, so a
// partial update never overwrites fields another part of the extension wrote.

import { EMPTY_STORE, type Store } from "../types";

export async function readStore(): Promise<Store> {
  return (await chrome.storage.local.get(EMPTY_STORE)) as Store;
}

export async function patchStore(patch: Partial<Store>): Promise<void> {
  await chrome.storage.local.set(patch);
}
