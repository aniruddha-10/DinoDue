// The clean shapes the whole extension agrees on. D2L's raw API objects are
// converted into these once (in d2l/normalize.ts); the UI only reads these.

export const D2L_ORIGIN = "https://d2l.ucalgary.ca";

export interface Course {
  id: number;              // D2L OrgUnit id
  code: string | null;     // "CPSC331_L01" or whatever D2L stores
  name: string;
  startDate: string | null;
  endDate: string | null;
  lastAccessed: string | null;
}

// A course shown in the first-run picker. `suggested` means we think it's
// this term's course and pre-tick it; the student confirms.
export interface CourseCandidate extends Course {
  suggested: boolean;
  reason: SuggestReason | null;
}
export type SuggestReason = "dates" | "termInName" | "recentlyOpened";

export interface User {
  firstName: string;
}

export type DeadlineKind = "assignment" | "quiz" | "event";

export interface Grade {
  points: number | null;
  outOf: number | null;
  display: string | null;  // what D2L shows, e.g. "90 %"
}

// How a deadline was tied to its gradebook entry. "fuzzy" matches are shown
// to the student to confirm; "manual" is one they picked themselves.
export type GradeLink = "d2l" | "name" | "fuzzy" | "manual";

export interface Deadline {
  id: string;              // unique across courses and kinds: "quiz-123-456"
  sourceId: number;
  courseId: number;
  kind: DeadlineKind;
  title: string;
  dueAt: string;           // ISO date
  url: string | null;      // opens the item in D2L
  submitted: boolean | null; // null = unknown (quizzes, events, failed lookups)
  gradeItemId: number | null;
  gradeLink: GradeLink | null;
  weight: number | null;   // share of the final course grade, in percent
  grade: Grade | null;     // null = not graded or not released
}

// A gradebook entry, kept so the student can pick the right one when a
// deadline was matched by name or not at all.
export interface GradeItemInfo {
  courseId: number;
  id: number;
  name: string;
  weight: number | null;   // share of the final course grade, in percent
  grade: Grade | null;
}

// Per-course summary of how the gradebook's weights add up.
export interface CourseWeights {
  courseId: number;
  // Sum of all counted top-level weights as D2L stores them.
  rawTotal: number;
  // "exact": ~100. "scaled": over 100, so shares were divided by rawTotal.
  // "partial": under 100, usually because something (often the final exam)
  // isn't in D2L yet. "none": no weighted gradebook.
  status: "exact" | "scaled" | "partial" | "none";
  missing: number;         // percent of the course not in D2L (partial only)
  // Grade so far over released items, in percent; null if nothing released.
  gradeSoFar: number | null;
  releasedWeight: number;  // percent of the course that has been graded
}

export type SyncStatus = "idle" | "syncing" | "error" | "signedOut";

// Errors are stored as codes; the UI turns them into localized text.
export type SyncErrorCode = "network" | "d2lError" | "noApiVersions";

export interface SyncState {
  status: SyncStatus;
  startedAt: number | null;
  lastSyncedAt: number | null;
  error: SyncErrorCode | null;
}

// Reminder notifications. `leadsHours` are how long before a deadline to
// remind, e.g. [48, 3] = two days before and three hours before.
export interface ReminderSettings {
  enabled: boolean;
  leadsHours: number[];
}

// Everything kept in chrome.storage.local.
export interface Store {
  user: User | null;
  candidates: CourseCandidate[];
  selectedCourseIds: number[] | null; // null = picker not confirmed yet
  hiddenEventCourseIds: number[];     // courses whose calendar events are hidden
  manualGradeLinks: Record<string, number | null>; // deadline id -> grade item id
  deadlines: Deadline[];
  gradeItems: GradeItemInfo[];
  weights: CourseWeights[];
  sync: SyncState;
  pendingSync: boolean;
  reminders: ReminderSettings;
  // Reminders already shown: "<deadline id>@<lead hours>" -> when. Pruned
  // once a deadline has passed.
  remindersSent: Record<string, number>;
}

export const EMPTY_STORE: Store = {
  user: null,
  candidates: [],
  selectedCourseIds: null,
  hiddenEventCourseIds: [],
  manualGradeLinks: {},
  deadlines: [],
  gradeItems: [],
  weights: [],
  sync: { status: "idle", startedAt: null, lastSyncedAt: null, error: null },
  pendingSync: false,
  reminders: { enabled: true, leadsHours: [48] },
  remindersSent: {},
};
