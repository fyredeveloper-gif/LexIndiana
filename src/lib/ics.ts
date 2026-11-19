import { addDaysISO, parseISODate } from "@/lib/dates";

type IcsEvent = {
  uid: string;
  dateISO: string;
  title: string;
  description?: string;
  location?: string;
};

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** RFC 5545 requires lines folded at 75 octets. */
function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    const width = start === 0 ? 75 : 74;
    let end = Math.min(start + width, bytes.length);
    // Avoid splitting a UTF-8 multi-byte sequence.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    const chunk = bytes.subarray(start, end).toString("utf8");
    parts.push(start === 0 ? chunk : ` ${chunk}`);
    start = end;
  }
  return parts.join("\r\n");
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildDeadlineCalendar(
  events: IcsEvent[],
  calendarName = "Lex Indiana — Court Deadlines",
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lex Indiana//Court Deadlines//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    "X-WR-TIMEZONE:America/Indiana/Indianapolis",
  ];

  const created = stamp();
  for (const event of events) {
    const start = parseISODate(event.dateISO);
    const endISO = addDaysISO(event.dateISO, 1);
    const end = parseISODate(endISO);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}@lexindiana`,
      `DTSTAMP:${created}`,
      `DTSTART;VALUE=DATE:${start.toISOString().slice(0, 10).replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replace(/-/g, "")}`,
      `SUMMARY:${escapeText(event.title)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    lines.push(
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "TRIGGER:-P1D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(`Deadline tomorrow: ${event.title}`)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
