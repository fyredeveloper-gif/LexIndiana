import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { formatDate, formatMoney } from "@/lib/dates";
import { INVOICE_STATUS_LABELS } from "@/lib/utils";

export type InvoicePdfData = {
  firm: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    attorneyName: string;
    attorneyNumber: string | null;
  };
  invoice: {
    number: string;
    issueDate: string;
    dueDate: string | null;
    status: string;
    notes: string | null;
    subtotal: number;
    total: number;
  };
  client: { name: string; organization: string | null; email: string | null; address: string | null };
  matter: { title: string; causeNumber: string | null; county: string; courtName: string | null };
  items: Array<{ description: string; workDate: string; hours: number; rate: number; amount: number }>;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const RIGHT = PAGE_WIDTH - MARGIN;
const NAVY = rgb(0.05, 0.11, 0.17);
const MUTED = rgb(0.38, 0.44, 0.51);
const RULE = rgb(0.84, 0.86, 0.89);
const BRASS = rgb(0.69, 0.53, 0.22);
const BAND = rgb(0.96, 0.97, 0.98);

function wrap(text: string, font: PDFFont, size: number, width: number, maxLines = 2): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word.slice(0, 90);
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines) {
    const lastIndex = maxLines - 1;
    let last = lines[lastIndex];
    while (last.length > 4 && font.widthOfTextAtSize(`${last}…`, size) > width) {
      last = last.slice(0, -1);
    }
    lines[lastIndex] = font.widthOfTextAtSize(`${last}…`, size) > width ? last : `${last}…`;
  }
  return lines;
}

function rightAligned(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, color = NAVY) {
  page.drawText(text, { x: x - font.widthOfTextAtSize(text, size), y, font, size, color });
}

export async function buildInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${data.invoice.number}`);
  doc.setAuthor(data.firm.name);
  doc.setSubject(`Invoice for ${data.matter.title}`);

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const serif = await doc.embedFont(StandardFonts.TimesRoman);

  const pages: PDFPage[] = [];
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pages.push(page);
  let y = PAGE_HEIGHT - MARGIN;

  const drawTableHeader = (target: PDFPage, cursor: number) => {
    target.drawRectangle({ x: MARGIN, y: cursor - 4, width: RIGHT - MARGIN, height: 18, color: BAND });
    target.drawText("DATE", { x: MARGIN + 6, y: cursor + 1, font: bold, size: 7.5, color: MUTED });
    target.drawText("DESCRIPTION OF SERVICES", { x: 124, y: cursor + 1, font: bold, size: 7.5, color: MUTED });
    rightAligned(target, "HOURS", 388, cursor + 1, bold, 7.5, MUTED);
    rightAligned(target, "RATE", 468, cursor + 1, bold, 7.5, MUTED);
    rightAligned(target, "AMOUNT", RIGHT, cursor + 1, bold, 7.5, MUTED);
    target.drawLine({ start: { x: MARGIN, y: cursor - 5 }, end: { x: RIGHT, y: cursor - 5 }, thickness: 0.7, color: RULE });
    return cursor - 24;
  };

  // ---- Firm header -------------------------------------------------------
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 118, width: PAGE_WIDTH, height: 118, color: NAVY });
  page.drawText((data.firm.name || "Law Office").slice(0, 52), {
    x: MARGIN,
    y: PAGE_HEIGHT - 58,
    font: serifBold,
    size: 21,
    color: rgb(1, 1, 1),
  });
  const firmLines = [
    data.firm.attorneyName + (data.firm.attorneyNumber ? `  •  Indiana Attorney No. ${data.firm.attorneyNumber}` : ""),
    data.firm.address,
    [data.firm.phone, data.firm.email].filter(Boolean).join("  •  "),
  ].filter((line): line is string => Boolean(line && line.trim()));
  let firmY = PAGE_HEIGHT - 78;
  for (const line of firmLines.slice(0, 3)) {
    page.drawText(line.slice(0, 110), { x: MARGIN, y: firmY, font: regular, size: 8.5, color: rgb(0.82, 0.86, 0.9) });
    firmY -= 12;
  }

  page.drawText("INVOICE", { x: MARGIN, y: PAGE_HEIGHT - 152, font: serifBold, size: 24, color: NAVY });
  page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - 160 }, end: { x: 180, y: PAGE_HEIGHT - 160 }, thickness: 2, color: BRASS });

  rightAligned(page, `Invoice ${data.invoice.number}`, RIGHT, PAGE_HEIGHT - 146, bold, 11);
  rightAligned(page, `Issued ${formatDate(data.invoice.issueDate)}`, RIGHT, PAGE_HEIGHT - 162, regular, 9, MUTED);
  if (data.invoice.dueDate) {
    rightAligned(page, `Due ${formatDate(data.invoice.dueDate)}`, RIGHT, PAGE_HEIGHT - 176, regular, 9, MUTED);
  }
  rightAligned(
    page,
    `Status: ${INVOICE_STATUS_LABELS[data.invoice.status] ?? data.invoice.status}`,
    RIGHT,
    PAGE_HEIGHT - 190,
    regular,
    9,
    MUTED,
  );

  y = PAGE_HEIGHT - 212;

  // ---- Bill to / matter --------------------------------------------------
  const billToX = MARGIN;
  page.drawText("BILL TO", { x: billToX, y, font: bold, size: 7.5, color: MUTED });
  page.drawText(data.client.name.slice(0, 60), { x: billToX, y: y - 15, font: bold, size: 10.5, color: NAVY });
  let billY = y - 29;
  const billLines = [data.client.organization, data.client.address, data.client.email].filter(
    (value): value is string => Boolean(value),
  );
  for (const line of billLines.slice(0, 4)) {
    page.drawText(line.slice(0, 68), { x: billToX, y: billY, font: regular, size: 8.5, color: MUTED });
    billY -= 11;
  }

  const matterX = 330;
  page.drawText("MATTER", { x: matterX, y, font: bold, size: 7.5, color: MUTED });
  page.drawText(data.matter.title.slice(0, 46), { x: matterX, y: y - 15, font: bold, size: 10.5, color: NAVY });
  let matterY = y - 29;
  const matterLines = [
    data.matter.causeNumber ? `Cause No. ${data.matter.causeNumber}` : null,
    data.matter.courtName ? data.matter.courtName.slice(0, 50) : null,
    `${data.matter.county} County`,
  ].filter((value): value is string => Boolean(value));
  for (const line of matterLines.slice(0, 4)) {
    page.drawText(line.slice(0, 60), { x: matterX, y: matterY, font: regular, size: 8.5, color: MUTED });
    matterY -= 11;
  }

  y = Math.min(billY, matterY) - 14;
  y = drawTableHeader(page, y);

  // ---- Items -------------------------------------------------------------
  for (const item of data.items) {
    if (y < 150) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pages.push(page);
      y = drawTableHeader(page, PAGE_HEIGHT - MARGIN - 10);
    }
    const descriptionLines = wrap(item.description, regular, 9.5, 246, 2);
    page.drawText(formatDate(item.workDate), { x: MARGIN + 6, y, font: regular, size: 9, color: NAVY });
    descriptionLines.forEach((line, index) => {
      page.drawText(line, { x: 124, y: y - index * 11.5, font: regular, size: 9.5, color: NAVY });
    });
    rightAligned(page, item.hours.toFixed(2), 388, y, regular, 9.5);
    rightAligned(page, formatMoney(item.rate), 468, y, regular, 9.5);
    rightAligned(page, formatMoney(item.amount), RIGHT, y, regular, 9.5);
    y -= Math.max(22, descriptionLines.length * 11.5 + 10);
    page.drawLine({ start: { x: MARGIN, y: y + 8 }, end: { x: RIGHT, y: y + 8 }, thickness: 0.4, color: RULE });
  }

  // ---- Totals ------------------------------------------------------------
  if (y < 210) {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    y = PAGE_HEIGHT - MARGIN;
  }
  const totalRows: Array<[string, string, boolean]> = [
    ["Subtotal", formatMoney(data.invoice.subtotal), false],
    ["Total due", formatMoney(data.invoice.total), true],
  ];
  let totalY = y - 6;
  for (const [label, value, emphasis] of totalRows) {
    if (emphasis) {
      page.drawRectangle({ x: 330, y: totalY - 7, width: RIGHT - 330, height: 26, color: NAVY });
      page.drawText(label, { x: 342, y: totalY + 1, font: bold, size: 10, color: rgb(1, 1, 1) });
      rightAligned(page, value, RIGHT - 10, totalY + 1, bold, 11, rgb(1, 1, 1));
      totalY -= 34;
    } else {
      page.drawText(label, { x: 342, y: totalY + 2, font: regular, size: 9.5, color: MUTED });
      rightAligned(page, value, RIGHT - 10, totalY + 2, regular, 9.5, NAVY);
      totalY -= 18;
    }
  }

  if (data.invoice.notes) {
    const noteLines = wrap(data.invoice.notes, regular, 8.5, 250, 4);
    page.drawText("NOTES", { x: MARGIN, y: totalY + 2, font: bold, size: 7.5, color: MUTED });
    noteLines.forEach((line, index) => {
      page.drawText(line, { x: MARGIN, y: totalY - 12 - index * 11, font: regular, size: 8.5, color: MUTED });
    });
  }

  const totalLabel = `Total balance due: ${formatMoney(data.invoice.total)}`;
  page.drawText(totalLabel, { x: MARGIN, y: 96, font: serif, size: 11, color: NAVY });
  page.drawText(`Payable to ${data.firm.name || "the firm"}. Please reference invoice ${data.invoice.number}.`, {
    x: MARGIN,
    y: 82,
    font: regular,
    size: 8,
    color: MUTED,
  });

  // ---- Footers -----------------------------------------------------------
  pages.forEach((target, index) => {
    target.drawLine({ start: { x: MARGIN, y: 62 }, end: { x: RIGHT, y: 62 }, thickness: 0.5, color: RULE });
    target.drawText(`${data.firm.name || "Law Office"}  •  Invoice ${data.invoice.number}`, {
      x: MARGIN,
      y: 48,
      font: regular,
      size: 7.5,
      color: MUTED,
    });
    rightAligned(target, `Page ${index + 1} of ${pages.length}`, RIGHT, 48, regular, 7.5, MUTED);
  });

  return doc.save();
}
