import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  jsonError,
  handleApiError,
  parseJsonBody,
  requireCapability,
  requireSameOrigin,
  unauthResponse,
  validate,
} from "@/lib/api";
import { isoDate, parseISODate, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { invoiceSchema } from "@/lib/validation";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "invoice:manage");
  if (denied) return denied;

  const parsed = validate(invoiceSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const { matterId, timeEntryIds, issueDate, dueDate, notes } = parsed.data;

  const matter = await prisma.matter.findFirst({
    where: { id: matterId, firmId: user.firmId },
    select: { id: true },
  });
  if (!matter) return jsonError("Select a matter from your workspace.", 400);

  const entries = await prisma.timeEntry.findMany({
    where: {
      id: { in: timeEntryIds },
      firmId: user.firmId,
      matterId: matter.id,
      invoiceId: null,
      billable: true,
      durationMinutes: { gt: 0 },
    },
    orderBy: { startedAt: "asc" },
  });

  if (entries.length !== new Set(timeEntryIds).size) {
    return jsonError("Some selected entries are no longer billable or belong to another matter.", 409);
  }

  const items = entries.map((entry) => {
    const hours = round2(entry.durationMinutes / 60);
    const rate = Number(entry.hourlyRate);
    return {
      timeEntryId: entry.id,
      description: entry.description,
      workDate: parseISODate(isoDate(entry.startedAt ?? entry.createdAt)),
      hours,
      rate,
      amount: round2(hours * rate),
    };
  });
  const subtotal = round2(items.reduce((sum, item) => sum + item.amount, 0));

  try {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      // Allocate from the firm sequence so two staff members cannot mint the same number.
      const firm = await prisma.firm.update({
        where: { id: user.firmId },
        data: { invoiceSeq: { increment: 1 } },
        select: { invoiceSeq: true },
      });
      const number = `INV-${new Date().getFullYear()}-${String(firm.invoiceSeq).padStart(4, "0")}`;

      try {
        const invoice = await prisma.$transaction(async (tx) => {
          const created = await tx.invoice.create({
            data: {
              firmId: user.firmId,
              userId: user.id,
              matterId: matter.id,
              number,
              issueDate: parseISODate(issueDate ?? todayISO()),
              dueDate: dueDate ? parseISODate(dueDate) : null,
              notes,
              subtotal,
              total: subtotal,
              items: { create: items },
            },
            select: { id: true, number: true },
          });

          const updated = await tx.timeEntry.updateMany({
            where: {
              id: { in: entries.map((entry) => entry.id) },
              firmId: user.firmId,
              invoiceId: null,
            },
            data: { invoiceId: created.id },
          });
          if (updated.count !== entries.length) {
            throw new Error("Concurrent billing detected");
          }
          return created;
        });

        return NextResponse.json({ ok: true, id: invoice.id, number: invoice.number }, { status: 201 });
      } catch (error) {
        if (isUniqueViolation(error) && attempt < 6) continue;
        throw error;
      }
    }
    return jsonError("Could not allocate an invoice number. Try again.", 500);
  } catch (error) {
    return handleApiError(error, "Could not generate the invoice.");
  }
}
