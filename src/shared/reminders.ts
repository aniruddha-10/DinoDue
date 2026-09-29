// Which deadlines to remind about right now. Pure, so it's unit-tested; the
// background worker (src/background) shows the notifications.
//
// Rules:
// - Only deadlines still ahead and not known to be submitted.
//   (Quizzes and events have no submission status, so they're reminded.)
// - Hidden calendar events are skipped, like everywhere else.
// - Each lead time fires once per deadline. If several are due at once (a
//   deadline synced in late), only the most urgent is shown and all are
//   marked sent, so one deadline never pops up twice in a row.

import type { Deadline, ReminderSettings } from "../types";
import { visibleDeadlines } from "./forecast";

const HOUR = 36e5;
const KEEP_AFTER_DUE_MS = 24 * HOUR;

export interface Reminder {
  deadline: Deadline;
  leadHours: number; // the lead time this reminder is for
  keys: string[];    // every "<id>@<lead>" to mark as sent
}

export const sentKey = (deadlineId: string, leadHours: number) => `${deadlineId}@${leadHours}`;

export function dueReminders(
  deadlines: Deadline[],
  hiddenEventCourseIds: number[],
  settings: ReminderSettings,
  sent: Record<string, number>,
  now: Date,
): Reminder[] {
  if (!settings.enabled || !settings.leadsHours.length) return [];
  const t = now.getTime();
  const leads = [...settings.leadsHours].sort((a, b) => a - b); // most urgent first
  const out: Reminder[] = [];

  for (const d of visibleDeadlines(deadlines, hiddenEventCourseIds)) {
    if (d.submitted === true) continue;
    const due = Date.parse(d.dueAt);
    if (!(due > t)) continue;

    const firing = leads.filter((h) => t >= due - h * HOUR && !(sentKey(d.id, h) in sent));
    if (!firing.length) continue;
    out.push({ deadline: d, leadHours: firing[0], keys: firing.map((h) => sentKey(d.id, h)) });
  }
  return out.sort((a, b) => Date.parse(a.deadline.dueAt) - Date.parse(b.deadline.dueAt));
}

// Drop sent-markers for deadlines that are gone or well past, so the log
// doesn't grow forever.
export function pruneSent(sent: Record<string, number>, deadlines: Deadline[], now: Date): Record<string, number> {
  const due = new Map(deadlines.map((d) => [d.id, Date.parse(d.dueAt)]));
  const t = now.getTime();
  return Object.fromEntries(
    Object.entries(sent).filter(([key]) => {
      const id = key.slice(0, key.lastIndexOf("@"));
      const at = due.get(id);
      return at !== undefined && at + KEEP_AFTER_DUE_MS > t;
    }),
  );
}
