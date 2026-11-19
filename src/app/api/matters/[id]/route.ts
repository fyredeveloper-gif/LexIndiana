import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  jsonError,
  notFound,
  parseJsonBody,
  requireCapability,
  requireSameOrigin,
  unauthResponse,
  validate,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { matterUpdateSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "matter:write");
  if (denied) return denied;

  const { id } = await params;
  const parsed = validate(matterUpdateSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const matter = await prisma.matter.findFirst({ where: { id, firmId: user.firmId }, select: { id: true } });
  if (!matter) return notFound("Matter not found.");

  const input = parsed.data;
  const data: Record<string, unknown> = {};

  if (input.clientId !== undefined) {
    const client = await prisma.contact.findFirst({
      where: { id: input.clientId, firmId: user.firmId, type: "CLIENT" },
      select: { id: true },
    });
    if (!client) return jsonError("Select a client from your contact list.", 400);
    data.clientId = client.id;
  }
  if (input.title !== undefined) data.title = input.title;
  if (input.causeNumber !== undefined) data.causeNumber = input.causeNumber || null;
  if (input.county !== undefined) data.county = input.county;
  if (input.courtName !== undefined) data.courtName = input.courtName || null;
  if (input.practiceArea !== undefined) data.practiceArea = input.practiceArea;
  if (input.status !== undefined) data.status = input.status;
  if (input.notes !== undefined) data.notes = input.notes || null;

  await prisma.matter.update({ where: { id: matter.id }, data });
  return NextResponse.json({ ok: true });
}
