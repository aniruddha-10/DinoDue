// A stand-in for the chrome.* APIs so the popup can be previewed with
// `npm run dev` in a normal browser tab. Sample data only; nothing here ships
// in the extension.
//
// Pick a screen with ?state=welcome | picker | main | quiet | signedOut
// (the forecast page, dev/forecast.html, uses "main" by default).

import messages from "../public/_locales/en/messages.json";
import { EMPTY_STORE, type CourseWeights, type Deadline, type GradeItemInfo, type Store } from "../src/types";

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

const TERM = { startDate: "2026-09-02T06:00:00Z", endDate: "2026-12-18T06:00:00Z" };
const candidates: Store["candidates"] = [
  { id: 1, code: "F2026CPSC331L01", name: "Data Structures, Algorithms, and Their Analysis", ...TERM, lastAccessed: null, suggested: true, reason: "dates" },
  { id: 2, code: "F2026MATH267L02", name: "University Calculus II", ...TERM, lastAccessed: null, suggested: true, reason: "termInName" },
  { id: 3, code: "F2026PHIL279L01", name: "Logic I", ...TERM, lastAccessed: null, suggested: true, reason: "termInName" },
  { id: 4, code: "F2026ENGG201L03", name: "Behaviour of Liquids, Gases and Solids", ...TERM, lastAccessed: null, suggested: true, reason: "recentlyOpened" },
  { id: 5, code: "W2026CPSC231L01", name: "Introduction to Computer Science I", startDate: null, endDate: null, lastAccessed: null, suggested: false, reason: null },
  { id: 6, code: null, name: "Library Research Skills (sandbox)", startDate: null, endDate: null, lastAccessed: null, suggested: false, reason: null },
];

const deadlines: Deadline[] = [
  dl(1, "assignment", "Assignment 1", at(-20, 23, 59), { weight: 8, submitted: true, grade: { points: 45, outOf: 50, display: "90 %" } }),
  dl(2, "quiz", "Quiz 1", at(-15, 23, 59), { weight: 3, grade: { points: 8, outOf: 10, display: "80 %" } }),
  dl(3, "assignment", "Reading response 1", at(-9, 17), { weight: 5, submitted: true }),
  dl(1, "event", "Midterm 1", at(2, 18), { weight: 25, gradeLink: "name" }),
  dl(2, "assignment", "Assignment 2", at(3, 23, 59), { weight: 10 }),
  dl(3, "assignment", "Reading response 3", at(4, 17), { weight: 5, submitted: true }),
  dl(4, "quiz", "Lab quiz 4", at(4, 23, 59), { weight: 2, gradeItemId: 902, gradeLink: "fuzzy" }),
  dl(2, "quiz", "Practice quiz", at(1, 12), { gradeItemId: null, gradeLink: null }),
  dl(1, "assignment", "Assignment 3: Heaps", at(10, 23, 59), { weight: 8 }),
  dl(4, "assignment", "Lab report 2", at(12, 17), { weight: 6 }),
  dl(3, "event", "Midterm", at(16, 14), { weight: 30, gradeLink: "name" }),
  dl(4, "event", "Design review", at(17, 10), { gradeItemId: null, gradeLink: null }),
  dl(2, "assignment", "Assignment 3", at(24, 23, 59), { weight: 10 }),
  dl(1, "assignment", "Assignment 4: Graphs", at(38, 23, 59), { weight: 8 }),
  dl(4, "assignment", "Final project", at(52, 23, 59), { weight: 30, gradeItemId: 903, gradeLink: "fuzzy" }),
  dl(3, "assignment", "Term paper", at(60, 17), { weight: 35 }),
];

const gradeItems: GradeItemInfo[] = [
  { courseId: 4, id: 901, name: "Lab quizzes", weight: 10, grade: null },
  { courseId: 4, id: 902, name: "Lab quiz 4 (online)", weight: 2, grade: null },
  { courseId: 4, id: 903, name: "Final design project", weight: 30, grade: null },
  { courseId: 4, id: 904, name: "Design review", weight: 5, grade: null },
  { courseId: 2, id: 905, name: "Weekly practice", weight: 5, grade: null },
];

const weights: CourseWeights[] = [
  { courseId: 1, status: "exact", rawTotal: 100, missing: 0, gradeSoFar: 90, releasedWeight: 8 },
  { courseId: 2, status: "scaled", rawTotal: 140, missing: 0, gradeSoFar: 80, releasedWeight: 3 },
  { courseId: 3, status: "partial", rawTotal: 80, missing: 20, gradeSoFar: null, releasedWeight: 0 },
  { courseId: 4, status: "exact", rawTotal: 100, missing: 0, gradeSoFar: null, releasedWeight: 0 },
];

const base: Store = {
  ...EMPTY_STORE,
  user: { firstName: "Sam" },
  sync: { status: "idle", startedAt: null, lastSyncedAt: now - 7 * 60_000, error: null },
};

const STATES: Record<string, Store> = {
  welcome: { ...EMPTY_STORE },
  picker: { ...base, candidates },
  main: { ...base, candidates, selectedCourseIds: [1, 2, 3, 4], deadlines, gradeItems, weights },
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
for (const key of ["picker", "quiet", "signedOut"]) STATES[key] = { ...STATES[key], gradeItems, weights };
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
  runtime: { getURL: (path: string) => `/${path}` },
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
