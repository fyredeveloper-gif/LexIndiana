export const INDIANA_TIME_ZONE = "America/Indiana/Indianapolis";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/** Date-only ISO string (YYYY-MM-DD) from a Date stored at UTC midnight. */
export function isoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Parse YYYY-MM-DD into a Date pinned at UTC midnight. */
export function parseISODate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid date");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Invalid date");
  }
  return date;
}

/** Today's date in Indiana, independent of server time zone. */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIANA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDaysISO(value: string, days: number): string {
  const date = parseISODate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

export function compareISO(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** e.g. "Feb 3, 2026". Formatted in UTC so server and client agree. */
export function formatDate(value: Date | string): string {
  const date = typeof value === "string" ? parseISODate(value) : value;
  return `${MONTHS[date.getUTCMonth()].slice(0, 3)} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/** e.g. "February 3, 2026". */
export function formatDateLong(value: Date | string): string {
  const date = typeof value === "string" ? parseISODate(value) : value;
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: INDIANA_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Offset of the Indiana time zone from UTC at a given instant, in milliseconds. */
function indianaOffsetAt(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIANA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour) % 24,
    Number(values.minute),
    Number(values.second),
  );
  return asUtc - date.getTime();
}

/**
 * Parse a wall-clock value from <input type="datetime-local"> as Indiana time.
 * The offset is calculated twice so values near a DST transition settle on the
 * offset that is actually in effect at the resulting instant.
 */
export function parseIndianaDateTime(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Invalid date and time");
  const [, year, month, day, hour, minute] = match.map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = indianaOffsetAt(new Date(utcGuess));
  let result = new Date(utcGuess - firstOffset);
  const secondOffset = indianaOffsetAt(result);
  if (secondOffset !== firstOffset) result = new Date(utcGuess - secondOffset);
  return result;
}

/**
 * Wall-clock value for <input type="datetime-local"> in Indiana time, so an
 * edit form shows the same time the calendar displays rather than UTC.
 */
export function toIndianaDateTimeLocal(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIANA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = values.hour === "24" ? "00" : values.hour;
  return `${values.year}-${values.month}-${values.day}T${hour}:${values.minute}`;
}

/** Calendar day in Indiana for a stored timestamp. */
export function isoDateInIndiana(value: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIANA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function formatTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: INDIANA_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatMoney(value: number | string): string {
  const amount = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

/** 90 -> "1.50" */
export function minutesToHours(minutes: number): string {
  return (minutes / 60).toFixed(2);
}

/** 90 -> "1h 30m" */
export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function daysUntil(iso: string, from = todayISO()): number {
  const target = parseISODate(iso).getTime();
  const start = parseISODate(from).getTime();
  return Math.round((target - start) / 86_400_000);
}

export function relativeDueLabel(iso: string): string {
  const diff = daysUntil(iso);
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} overdue`;
  return `In ${diff} days`;
}
