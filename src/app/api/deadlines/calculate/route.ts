import { z } from "zod";
import { NextResponse } from "next/server";
import {
  jsonError,
  parseJsonBody,
  requireCapability,
  requireSameOrigin,
  unauthResponse,
  validate,
} from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { calculateDeadline } from "@/lib/deadlines";
import { serviceMethodSchema } from "@/lib/validation";

const schema = z.object({
  triggerDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid trigger date."),
  days: z.coerce.number().int().min(1, "Enter at least one day.").max(3650),
  serviceMethod: serviceMethodSchema,
});

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "deadline:write");
  if (denied) return denied;

  const parsed = validate(schema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  try {
    const calculation = calculateDeadline({
      triggerDate: parsed.data.triggerDate,
      prescribedDays: parsed.data.days,
      serviceMethod: parsed.data.serviceMethod,
    });
    return NextResponse.json({ calculation });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not calculate the deadline.", 400);
  }
}
