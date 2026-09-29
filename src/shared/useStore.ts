import { useEffect, useState } from "react";
import type { Store } from "../types";
import { readStore } from "./storage";

// The stored data, kept live: re-read whenever the content script (or another
// popup) writes to storage. null until the first read finishes.
export function useStore(): Store | null {
  const [store, setStore] = useState<Store | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => readStore().then((s) => alive && setStore(s));
    const onChange = (_: unknown, area: string) => area === "local" && load();
    load();
    chrome.storage.onChanged.addListener(onChange);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChange);
    };
  }, []);
  return store;
}

// Re-render every minute so "Today" and "Synced 5 minutes ago" stay right.
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
