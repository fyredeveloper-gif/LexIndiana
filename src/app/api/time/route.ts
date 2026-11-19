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
import { parseISODate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { timeEntrySchema } from "@/lib/validation";

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "time:own");
  if (denied) return denied;

  const parsed = validate(timeEntrySchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const matter = await prisma.matter.findFirst({
    where: { id: parsed.data.matterId, firmId: user.firmId },
    select: { id: true },
  });
  if (!matter) return jsonError("Select a matter from your workspace.", 400);

  try {
    const minutes = Math.round(parsed.data.hours * 60);
    const startedAt = parseISODate(parsed.data.workDate);
    const rate = parsed.data.hourlyRate ?? user.defaultHourlyRate;

    const entry = await prisma.timeEntry.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        matterId: matter.id,
        description: parsed.data.description,
        startedAt,
        endedAt: new Date(startedAt.getTime() + minutes * 60_000),
        durationMinutes: minutes,
        hourlyRate: rate,
        billable: parsed.data.billable,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: entry.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Could not save the time entry.");
  }
}
