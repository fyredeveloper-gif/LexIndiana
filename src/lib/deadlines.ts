import { addDaysISO, parseISODate } from "./dates";

export type ServiceMethodKey = "PERSONAL" | "E_SERVICE" | "MAIL";

export const SERVICE_METHODS: Array<{
  key: ServiceMethodKey;
  label: string;
  description: string;
  addedDays: number;
}> = [
  {
    key: "PERSONAL",
    label: "Personal service",
    description: "Hand delivery or personal service — no additional days.",
    addedDays: 0,
  },
  {
    key: "E_SERVICE",
    label: "E-service (IOJA)",
    description: "Electronic service approved by the Indiana Office of Judicial Administration — no additional days.",
    addedDays: 0,
  },
  {
    key: "MAIL",
    label: "Certified / first-class mail",
    description: "United States mail — three days added under Trial Rule 6(G) (formerly 6(E)).",
    addedDays: 3,
  },
];

export type DeadlinePreset = {
  key: string;
  label: string;
  days: number;
  citation: string;
  description: string;
};

/**
 * Current as of the July 1, 2026 amendments to the Indiana Rules of Trial
 * Procedure. Presets cover statewide rules only — local rules, case management
 * orders and court closures are not modelled.
 */
export const DEADLINE_PRESETS: DeadlinePreset[] = [
  {
    key: "pleading_response",
    label: "Response to pleading (answer)",
    days: 20,
    citation: "Ind. R. Trial P. 6(D)(1)",
    description: "A response to a pleading must be filed within 20 days after service.",
  },
  {
    key: "motion_response",
    label: "Response to motion",
    days: 20,
    citation: "Ind. R. Trial P. 6(D)(2)",
    description:
      "A response to a motion must be filed within 20 days after service. Summary judgment, motions to correct error and Rule 60(B) motions are governed by their own rules.",
  },
  {
    key: "motion_reply",
    label: "Reply in support of motion",
    days: 14,
    citation: "Ind. R. Trial P. 6(D)(2)",
    description: "A reply must be filed within 14 days after service of the response.",
  },
  {
    key: "discovery_response",
    label: "Response to written discovery",
    days: 30,
    citation: "Ind. R. Trial P. 33, 34, 36",
    description: "Answers to interrogatories, responses to production requests, and answers to requests for admission are due 30 days after service.",
  },
  {
    key: "jury_demand",
    label: "Jury demand",
    days: 10,
    citation: "Ind. R. Trial P. 38(B)",
    description: "A jury demand must be served not later than 10 days after service of the last pleading.",
  },
  {
    key: "motion_to_correct_error",
    label: "Motion to correct error",
    days: 30,
    citation: "Ind. R. Trial P. 59(C)",
    description: "Must be filed within 30 days after the entry of final judgment or the announcement of a decision.",
  },
  {
    key: "notice_of_appeal",
    label: "Notice of appeal",
    days: 30,
    citation: "Ind. R. App. P. 9(A)",
    description: "The notice of appeal must be filed within 30 days after the entry of final judgment.",
  },
  {
    key: "custom",
    label: "Custom period",
    days: 0,
    citation: "",
    description: "Enter any period prescribed by rule, statute, or court order.",
  },
];

export const DEADLINE_DISCLAIMER =
  "Calculated under Ind. R. Trial P. 6 as amended July 1, 2026, using Indiana legal holidays (Ind. Code § 1-1-9-1). Local rules, case-management orders, court closures, and election-day variations are not modelled. Verify every date before filing.";

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function isoFromParts(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function weekday(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** weekday: 0 = Sunday. n = 1 for the first occurrence. */
function nthWeekday(year: number, month: number, targetWeekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (targetWeekday - first.getUTCDay() + 7) % 7;
  return isoFromParts(year, month, 1 + offset + (n - 1) * 7);
}

function lastWeekday(year: number, month: number, targetWeekday: number): string {
  const last = new Date(Date.UTC(year, month, 0));
  const offset = (last.getUTCDay() - targetWeekday + 7) % 7;
  return isoFromParts(year, month, last.getUTCDate() - offset);
}

/** Anonymous Gregorian computus. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoFromParts(year, month, day);
}

export type Holiday = { date: string; name: string; observed: boolean };

/** Indiana legal holidays under Ind. Code § 1-1-9-1, including observed dates. */
export function indianaHolidays(year: number): Holiday[] {
  const base: Array<{ name: string; date: string }> = [
    { name: "New Year's Day", date: isoFromParts(year, 1, 1) },
    { name: "Martin Luther King, Jr. Day", date: nthWeekday(year, 1, 1, 3) },
    { name: "Abraham Lincoln's Birthday", date: isoFromParts(year, 2, 12) },
    { name: "Washington's Birthday", date: nthWeekday(year, 2, 1, 3) },
    { name: "Good Friday", date: addDaysISO(easterSunday(year), -2) },
    { name: "Memorial Day", date: lastWeekday(year, 5, 1) },
    { name: "Independence Day", date: isoFromParts(year, 7, 4) },
    { name: "Labor Day", date: nthWeekday(year, 9, 1, 1) },
    { name: "Columbus Day", date: nthWeekday(year, 10, 1, 2) },
    { name: "Veterans Day", date: isoFromParts(year, 11, 11) },
    { name: "Thanksgiving Day", date: nthWeekday(year, 11, 4, 4) },
    { name: "Christmas Day", date: isoFromParts(year, 12, 25) },
  ];

  if (year % 2 === 0) {
    base.push({ name: "Primary Election Day", date: nthWeekday(year, 5, 2, 1) });
    base.push({ name: "General Election Day", date: nthWeekday(year, 11, 2, 1) });
  }

  const holidays: Holiday[] = [...base.map((entry) => ({ ...entry, observed: false }))];
  for (const entry of base) {
    const [y, m, d] = entry.date.split("-").map(Number);
    const day = weekday(y, m, d);
    if (day === 6) {
      holidays.push({ date: addDaysISO(entry.date, -1), name: `${entry.name} (observed)`, observed: true });
    } else if (day === 0) {
      holidays.push({ date: addDaysISO(entry.date, 1), name: `${entry.name} (observed)`, observed: true });
    }
  }
  return holidays;
}

export function holidayMap(startYear: number, endYear: number): Map<string, string> {
  const map = new Map<string, string>();
  for (let year = startYear; year <= endYear; year += 1) {
    for (const holiday of indianaHolidays(year)) {
      if (!map.has(holiday.date)) map.set(holiday.date, holiday.name);
    }
  }
  return map;
}

function closedReason(dateISO: string, holidays: Map<string, string>): string | null {
  const day = parseISODate(dateISO).getUTCDay();
  if (day === 0) return "Sunday";
  if (day === 6) return "Saturday";
  return holidays.get(dateISO) ?? null;
}

export type DeadlineAdjustment = { date: string; reason: string };

export type DeadlineCalculation = {
  triggerDate: string;
  serviceMethod: ServiceMethodKey;
  serviceLabel: string;
  prescribedDays: number;
  mailDaysAdded: number;
  totalDays: number;
  unadjustedDueDate: string;
  dueDate: string;
  rolled: boolean;
  adjustments: DeadlineAdjustment[];
  notes: string[];
};

/**
 * Computes a forward deadline from a trigger event.
 *
 * - Day of the triggering event is excluded (T.R. 6(A)).
 * - Periods shorter than seven days skip intermediate weekends/holidays.
 * - Mail service adds three days (T.R. 6(G), formerly 6(E)); e-service adds none.
 * - A due date landing on a weekend or Indiana legal holiday rolls to the next open day.
 */
export function calculateDeadline(input: {
  triggerDate: string;
  prescribedDays: number;
  serviceMethod: ServiceMethodKey;
}): DeadlineCalculation {
  const { triggerDate, prescribedDays, serviceMethod } = input;
  if (!Number.isInteger(prescribedDays) || prescribedDays < 1 || prescribedDays > 3650) {
    throw new Error("The prescribed period must be between 1 and 3,650 days.");
  }

  const [year] = triggerDate.split("-").map(Number);
  const holidays = holidayMap(year - 1, year + 3);
  const service = SERVICE_METHODS.find((method) => method.key === serviceMethod) ?? SERVICE_METHODS[0];
  const totalDays = prescribedDays + service.addedDays;
  const notes: string[] = [];

  let cursor: string;
  if (prescribedDays < 7) {
    // Exclude intermediate weekends and holidays for short periods (T.R. 6(A)).
    cursor = addDaysISO(triggerDate, 1);
    let counted = 0;
    while (counted < totalDays) {
      if (!closedReason(cursor, holidays)) counted += 1;
      if (counted < totalDays) cursor = addDaysISO(cursor, 1);
    }
    notes.push("Period is shorter than seven days, so intermediate weekends and holidays were excluded.");
  } else {
    cursor = addDaysISO(triggerDate, totalDays);
  }

  if (service.addedDays > 0) {
    notes.push(`Three days added for service by United States mail (T.R. 6(G), formerly 6(E)).`);
  }
  if (serviceMethod === "E_SERVICE") {
    notes.push("Electronic service is complete on transmission; no additional days are added.");
  }

  const unadjustedDueDate = cursor;
  const adjustments: DeadlineAdjustment[] = [];
  let reason = closedReason(cursor, holidays);
  while (reason) {
    adjustments.push({ date: cursor, reason });
    cursor = addDaysISO(cursor, 1);
    reason = closedReason(cursor, holidays);
  }
  if (adjustments.length > 0) {
    notes.push(
      `Deadline rolled forward from ${unadjustedDueDate} because the last day fell on ${adjustments[0].reason}.`,
    );
  }

  return {
    triggerDate,
    serviceMethod,
    serviceLabel: service.label,
    prescribedDays,
    mailDaysAdded: service.addedDays,
    totalDays,
    unadjustedDueDate,
    dueDate: cursor,
    rolled: adjustments.length > 0,
    adjustments,
    notes,
  };
}

/** Next N holidays on/after today, for the UI reference panel. */
export function upcomingHolidays(fromISO: string, count = 6): Holiday[] {
  const [year] = fromISO.split("-").map(Number);
  return indianaHolidays(year)
    .concat(indianaHolidays(year + 1))
    .filter((holiday) => holiday.date >= fromISO)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, count);
}
