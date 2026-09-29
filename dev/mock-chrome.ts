// A stand-in for the chrome.* APIs so the popup can be previewed with
// `npm run dev` in a normal browser tab. Sample data only; nothing here ships
// in the extension.
//
// Pick a screen with ?state=welcome | picker | main | quiet | signedOut

import messages from "../public/_locales/en/messages.json";
import { EMPTY_STORE, type Deadline, type Store } from "../src/types";

type Messages = Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;

function getMessage(key: string, subs: string[] = []): string {
  const entry = (messages as Messages)[key];
  if (!entry) return "";
  let text = entry.message.replace(/\$([A-Za-z_]+)\$/g, (_, name: string) => entry.placeholders?.[name.toLowerCase()]?.content ?? "");
  text = text.replace(/\$(\d)/g, (_, i: string) => subs[Number(i) - 1] ?? "");
  return text;
}

const now = Date.now();
const at = (days: number, hour: number, minute = 0) => {
  const d = new Date(now + days * 864e5);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

let n = 0;
const dl = (courseId: number, kind: Deadline["kind"], title: string, dueAt: string, extra: Partial<Deadline> = {}): Deadline => ({
  id: `${kind}-${courseId}-${++n}`,
  sourceId: n,
  courseId,
  kind,
  title,
  dueAt,
  url: "/d2l/home",
  submitted: kind === "assignment" ? false : null,
  gradeItemId: n,
  gradeLink: "d2l",
  weight: null,
  grade: null,
  ...extra,
});

const candidates: Store["candidates"] = [
  { id: 1, code: "CPSC 331", name: "Data Structures, Algorithms, and Their Analysis", startDate: null, endDate: null, lastAccessed: null, suggested: true, reason: "dates" },
  { id: 2, code: "MATH 267", name: "University Calculus II", startDate: null, endDate: null, lastAccessed: null, suggested: true, reason: "recentlyOpened" },
  { id: 3, code: "PHIL 279", name: "Logic I", startDate: null, endDate: null, lastAccessed: null, suggested: true, reason: "termInName" },
  { id: 4, code: "ENGG 201", name: "Behaviour of Liquids, Gases and Solids", startDate: null, endDate: null, lastAccessed: null, suggested: true, reason: "recentlyOpened" },
  { id: 5, code: "CPSC 231", name: "Introduction to Computer Science I", startDate: null, endDate: null, lastAccessed: null, suggested: false, reason: null },
  { id: 6, code: null, name: "Library Research Skills (sandbox)", startDate: null, endDate: null, lastAccessed: null, suggested: false, reason: null },
];

const deadlines: Deadline[] = [
  dl(1, "event", "Midterm 1", at(2, 18), { weight: 25, gradeLink: "name" }),
  dl(2, "assignment", "Assignment 2", at(3, 23, 59), { weight: 10 }),
  dl(3, "assignment", "Reading response 3", at(4, 17), { weight: 5, submitted: true }),
  dl(4, "quiz", "Lab quiz 4", at(4, 23, 59), { weight: 2, gradeLink: "fuzzy" }),
  dl(2, "quiz", "Practice quiz", at(1, 12), { gradeItemId: null, gradeLink: null }),
  dl(1, "assignment", "Assignment 3: Heaps", at(10, 23, 59), { weight: 8 }),
  dl(4, "assignment", "Lab report 2", at(12, 17), { weight: 6 }),
  dl(3, "event", "Midterm", at(16, 14), { weight: 30, gradeLink: "name" }),
];

const base: Store = {
  ...EMPTY_STORE,
  user: { firstName: "Sam" },
  sync: { status: "idle", startedAt: null, lastSyncedAt: now - 7 * 60_000, error: null },
};

const STATES: Record<string, Store> = {
  welcome: { ...EMPTY_STORE },
  picker: { ...base, candidates },
  main: { ...base, candidates, selectedCourseIds: [1, 2, 3, 4], deadlines },
  quiet: { ...base, candidates, selectedCourseIds: [1, 2], deadlines: [deadlines[5]] },
  signedOut: {
    ...base,
    candidates,
    selectedCourseIds: [1, 2, 3, 4],
    deadlines,
    sync: { ...base.sync, status: "signedOut" },
  },
};

const state = new URLSearchParams(location.search).get("state") ?? "main";
let data: Record<string, unknown> = structuredClone(STATES[state] ?? STATES.main) as unknown as Record<string, unknown>;
const listeners = new Set<(changes: Record<string, { newValue: unknown }>, area: string) => void>();

const chromeMock = {
  i18n: { getMessage, getUILanguage: () => navigator.language || "en-CA" },
  storage: {
    local: {
      async get(defaults: Record<string, unknown>) {
        return { ...defaults, ...structuredClone(data) };
      },
      async set(patch: Record<string, unknown>) {
        data = { ...data, ...structuredClone(patch) };
        const changes = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, { newValue: v }]));
        listeners.forEach((l) => l(changes, "local"));
      },
    },
    onChanged: {
      addListener: (l: never) => listeners.add(l),
      removeListener: (l: never) => listeners.delete(l),
    },
  },
  tabs: {
    async query() {
      return [];
    },
    async create(opts: { url: string }) {
      console.info("[mock] would open", opts.url);
      return {};
    },
  },
};

(globalThis as unknown as { chrome: unknown }).chrome = chromeMock;
