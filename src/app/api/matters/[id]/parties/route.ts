import { z } from "zod";
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
import { contactTypeSchema } from "@/lib/validation";

const attachSchema = z.object({
  contactId: z.string().min(1).max(64),
  role: contactTypeSchema,
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "matter:write");
  if (denied) return denied;

  const { id } = await params;
  const parsed = validate(attachSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const [matter, contact] = await Promise.all([
    prisma.matter.findFirst({ where: { id, firmId: user.firmId }, select: { id: true } }),
    prisma.contact.findFirst({ where: { id: parsed.data.contactId, firmId: user.firmId }, select: { id: true } }),
  ]);
  if (!matter) return notFound("Matter not found.");
  if (!contact) return jsonError("Contact not found in your workspace.", 400);

  try {
    await prisma.matterContact.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        matterId: matter.id,
        contactId: contact.id,
        role: parsed.data.role,
      },
    });
  } catch {
    return jsonError("That party is already linked to this matter in that role.", 409);
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "matter:write");
  if (denied) return denied;

  const { id } = await params;
  const partyId = new URL(request.url).searchParams.get("partyId");
  if (!partyId) return jsonError("partyId is required.", 400);

  const deleted = await prisma.matterContact.deleteMany({
    where: { id: partyId, matterId: id, firmId: user.firmId },
  });
  if (deleted.count === 0) return notFound("Party link not found.");
  return NextResponse.json({ ok: true });
}
