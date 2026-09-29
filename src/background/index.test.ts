// Runs the real background worker against a fake chrome.* to check what it
// shows, what it records, and that it doesn't repeat itself.

import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../public/_locales/en/messages.json";
import { EMPTY_STORE, type Deadline, type Store } from "../types";

type Listener = (...args: never[]) => unknown;
type Messages = Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;

const NOW = new Date("2026-09-28T18:00:00Z");
const inHours = (h: number) => new Date(NOW.getTime() + h * 36e5).toISOString();

const dl = (id: string, hours: number, extra: Partial<Deadline> = {}): Deadline => ({
  id,
  sourceId: 1,
  courseId: 1,
  kind: "assignment",
  title: `Title ${id}`,
  dueAt: inHours(hours),
  url: `/d2l/lms/dropbox/user/folder_submit_files.d2l?db=1&ou=1`,
  submitted: false,
  gradeItemId: null,
  gradeLink: null,
  weight: null,
  grade: null,
  ...extra,
});

function fakeChrome(initial: Partial<Store>) {
  let data: Record<string, unknown> = { ...initial };
  const listeners: Record<string, Listener[]> = {};
  const on = (name: string) => ({ addListener: (l: Listener) => (listeners[name] ??= []).push(l) });
  const created: { id: string; title: string; message: string }[] = [];
  const tabs: string[] = [];
  const chrome = {
    i18n: {
      getUILanguage: () => "en-US",
      getMessage: (key: string, subs: string[] = []) => {
        const e = (messages as Messages)[key];
        if (!e) return "";
        return e.message
          .replace(/\$([A-Za-z_]+)\$/g, (_, n: string) => e.placeholders?.[n.toLowerCase()]?.content ?? "")
          .replace(/\$(\d)/g, (_, i: string) => subs[Number(i) - 1] ?? "");
      },
    },
    storage: {
      local: {
        get: async (defaults: Record<string, unknown>) => ({ ...defaults, ...structuredClone(data) }),
        set: async (patch: Record<string, unknown>) => {
          data = { ...data, ...structuredClone(patch) };
        },
      },
      onChanged: on("storage"),
    },
    alarms: { get: async () => undefined, create: async () => undefined, onAlarm: on("alarm") },
    runtime: { onInstalled: on("installed"), onStartup: on("startup"), getURL: (p: string) => `chrome-extension://x/${p}` },
    notifications: {
      create: async (id: string, o: { title: string; message: string }) => void created.push({ id, ...o }),
      clear: async () => true,
      onClicked: on("clicked"),
    },
    tabs: { create: async (o: { url: string }) => void tabs.push(o.url) },
  };
  const fire = async (name: string, ...args: unknown[]) => {
    for (const l of listeners[name] ?? []) await (l as (...a: unknown[]) => unknown)(...args);
    await new Promise((r) => setTimeout(r, 20)); // let the check queue drain
  };
  return { chrome, created, tabs, fire, read: () => data };
}

async function load(initial: Partial<Store>) {
  const fake = fakeChrome({ ...EMPTY_STORE, ...initial });
  vi.stubGlobal("chrome", fake.chrome);
  vi.resetModules();
  await import("./index");
  return fake;
}

const candidates = [
  { id: 1, code: "F2026CPSC331L01", name: "Data Structures", startDate: null, endDate: null, lastAccessed: null, suggested: true, reason: null },
] as Store["candidates"];

describe("background reminders", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  });

  it("shows a reminder with course, time, and weight, records it, and doesn't repeat it", async () => {
    const fake = await load({ candidates, deadlines: [dl("a", 20, { weight: 10 })] });
    await fake.fire("alarm", { name: "reminders" });

    expect(fake.created).toHaveLength(1);
    expect(fake.created[0].id).toBe("dd:a");
    expect(fake.created[0].title).toBe("Title a");
    expect(fake.created[0].message).toMatch(/^CPSC 331, due tomorrow at 8:00 AM · worth 10%$/);
    expect(Object.keys(fake.read().remindersSent as object)).toEqual(["a@48"]);

    await fake.fire("alarm", { name: "reminders" });
    expect(fake.created).toHaveLength(1);
  });

  it("groups more than two reminders into one summary", async () => {
    const fake = await load({ candidates, deadlines: [dl("a", 5), dl("b", 6), dl("c", 7)] });
    await fake.fire("alarm", { name: "reminders" });
    expect(fake.created).toHaveLength(1);
    expect(fake.created[0].title).toBe("3 things due soon");
    expect(Object.keys(fake.read().remindersSent as object).sort()).toEqual(["a@48", "b@48", "c@48"]);
  });

  it("stays quiet when reminders are off", async () => {
    const fake = await load({ candidates, deadlines: [dl("a", 5)], reminders: { enabled: false, leadsHours: [48] } });
    await fake.fire("alarm", { name: "reminders" });
    expect(fake.created).toEqual([]);
  });

  it("checks after a sync writes new deadlines", async () => {
    const fake = await load({ candidates, deadlines: [dl("a", 5)] });
    await fake.fire("storage", { deadlines: { newValue: [] } }, "local");
    expect(fake.created.map((n) => n.id)).toEqual(["dd:a"]);
  });

  it("opens the deadline in D2L when a reminder is clicked, and the forecast for a summary", async () => {
    const fake = await load({ candidates, deadlines: [dl("a", 5)] });
    await fake.fire("clicked", "dd:a");
    await fake.fire("clicked", "sum:123");
    expect(fake.tabs).toEqual([
      "https://d2l.ucalgary.ca/d2l/lms/dropbox/user/folder_submit_files.d2l?db=1&ou=1",
      "chrome-extension://x/forecast.html",
    ]);
  });
});
