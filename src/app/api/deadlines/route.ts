import { NextResponse } from "next/server";
import {
  jsonError,
  handleApiError,
  parseJsonBody,
  requireCapability,
  requireSameOrigin,
  unauthResponse,
  validate,
} from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { calculateDeadline } from "@/lib/deadlines";
import { parseISODate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { deadlineSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "deadline:write");
  if (denied) return denied;

  const parsed = validate(deadlineSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const { matterId, title, ruleKey, ruleCitation, triggerEvent, triggerDate, serviceMethod, days, notes } =
    parsed.data;

  if (matterId) {
    const matter = await prisma.matter.findFirst({ where: { id: matterId, firmId: user.firmId }, select: { id: true } });
    if (!matter) return jsonError("Select a matter from your workspace.", 400);
  }

  try {
    const calculation = calculateDeadline({ triggerDate, prescribedDays: days, serviceMethod });
    const deadline = await prisma.deadline.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        matterId,
        title,
        ruleKey,
        ruleCitation,
        triggerEvent,
        triggerDate: parseISODate(triggerDate),
        serviceMethod,
        daysAdded: calculation.mailDaysAdded,
        dueDate: parseISODate(calculation.dueDate),
        notes,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: deadline.id, calculation }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Could not save the deadline.");
  }
}
