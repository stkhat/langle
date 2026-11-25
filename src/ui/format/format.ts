import { formatTag, t, uiLocale } from "../../i18n/t";

/**
 * A formatter for the interface language, made once per language: dates, times and
 * numbers read as the interface around them, in digits 0–9 (architecture "Interface
 * language"). `make` gets the Intl tag (`formatTag`).
 */
function perLocale<F>(make: (tag: string) => F): () => F {
  const made = new Map<string, F>();
  return () => {
    const locale = uiLocale();
    let formatter = made.get(locale);
    if (!formatter) {
      formatter = make(formatTag(locale));
      made.set(locale, formatter);
    }
    return formatter;
  };
}

const SECOND = 1000;
const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * SECOND],
  ["month", 30 * 24 * 60 * 60 * SECOND],
  ["day", 24 * 60 * 60 * SECOND],
  ["hour", 60 * 60 * SECOND],
  ["minute", 60 * SECOND],
];

const relative = perLocale(
  (locale) => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }),
);

/**
 * How long ago `at` was, e.g. "2 minutes ago", "yesterday"; under a minute (or a
 * little in the future, from another device's clock) "just now".
 */
export function relativeTime(at: number, now: number): string {
  const ago = now - at;
  for (const [unit, size] of UNITS)
    if (ago >= size) return relative().format(-Math.floor(ago / size), unit);
  return t("time.justNow");
}

/** Whole KB (1,024 bytes); any data at all counts as at least 1 KB. */
export function kilobytes(bytes: number): number {
  if (bytes <= 0) return 0;
  return Math.max(1, Math.round(bytes / 1024));
}

/** Whole MB (1,048,576 bytes); any data at all counts as at least 1 MB. */
export function megabytes(bytes: number): number {
  if (bytes <= 0) return 0;
  return Math.max(1, Math.round(bytes / (1024 * 1024)));
}

const tenths = perLocale(
  (locale) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
);

/**
 * MB (1,048,576 bytes) to one decimal, as text ("6.4"); any data at all counts as at
 * least 0.1 MB.
 */
export function megabytesTenths(bytes: number): string {
  if (bytes <= 0) return tenths().format(0);
  return tenths().format(Math.max(0.1, bytes / (1024 * 1024)));
}

const pad = (n: number) => String(n).padStart(2, "0");

const counts = perLocale((locale) => new Intl.NumberFormat(locale));

/** A count with thousands grouped as the interface language does: "12,345". */
export const fmt = (n: number) => counts().format(n);

/** A playback time as m:ss, or h:mm:ss from an hour on. */
export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = pad(total % 60);
  return h > 0 ? `${h}:${pad(m)}:${s}` : `${m}:${s}`;
}

/** `langle-backup-YYYY-MM-DD.json`, by the local date. */
export function backupFileName(date: Date): string {
  return `langle-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

export function sameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

const monthDay = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }),
);
const monthDayYear = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
);

/** "Today", "Nov 6" within this year, else "Nov 6, 2025" (local dates). */
export function shortDate(at: number, now: number): string {
  if (sameDay(at, now)) return t("time.today");
  return new Date(at).getFullYear() === new Date(now).getFullYear()
    ? monthDay().format(at)
    : monthDayYear().format(at);
}
