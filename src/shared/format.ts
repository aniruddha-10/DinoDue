// Locale-aware date and number formatting. Returns parts, not sentences, so
// the UI can put them into localized messages ("Today, $TIME$").

export type DueParts =
  | { kind: "today"; time: string }
  | { kind: "tomorrow"; time: string }
  | { kind: "date"; text: string };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function dueParts(iso: string, now: Date, locale: string): DueParts {
  const due = new Date(iso);
  const days = Math.round((startOfDay(due) - startOfDay(now)) / 864e5);
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(due);
  if (days === 0) return { kind: "today", time };
  if (days === 1) return { kind: "tomorrow", time };
  const opts: Intl.DateTimeFormatOptions =
    days > 1 && days < 7
      ? { weekday: "short", hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  return { kind: "date", text: new Intl.DateTimeFormat(locale, opts).format(due) };
}

export function percent(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(value / 100);
}

// "5 minutes ago", "yesterday", in the given locale.
export function relativeTime(then: number, now: number, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const s = Math.round((then - now) / 1000);
  if (Math.abs(s) < 60) return rtf.format(0, "second");
  const m = Math.round(s / 60);
  if (Math.abs(m) < 60) return rtf.format(m, "minute");
  const h = Math.round(m / 60);
  if (Math.abs(h) < 24) return rtf.format(h, "hour");
  return rtf.format(Math.round(h / 24), "day");
}
