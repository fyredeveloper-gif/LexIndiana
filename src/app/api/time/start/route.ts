import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  handleApiError,
  jsonError,
  parseJsonBody,
  requireCapability,
  requireSameOrigin,
  unauthResponse,
  validate,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { timerStartSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "time:own");
  if (denied) return denied;

  const parsed = validate(timerStartSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const matter = await prisma.matter.findFirst({
    where: { id: parsed.data.matterId, firmId: user.firmId },
    select: { id: true },
  });
  if (!matter) return jsonError("Select a matter from your workspace.", 400);

  const running = await prisma.timeEntry.findFirst({
    where: { firmId: user.firmId, userId: user.id, startedAt: { not: null }, endedAt: null },
    select: { id: true },
  });
  if (running) return jsonError("A timer is already running. Stop it before starting another.", 409);

  try {
    const entry = await prisma.timeEntry.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        matterId: matter.id,
        description: parsed.data.description?.trim() || "Timed work",
        startedAt: new Date(),
        durationMinutes: 0,
        hourlyRate: user.defaultHourlyRate,
        billable: true,
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, id: entry.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Could not start the timer.");
  }
}
