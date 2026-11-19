import { NextResponse } from "next/server";
import {
  handleApiError,
  jsonError,
  parseJsonBody,
  requireCapability,
  requireSameOrigin,
  unauthResponse,
  validate,
} from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { generateInviteToken, hashInviteToken, joinUrl } from "@/lib/firm";
import { prisma } from "@/lib/prisma";
import { inviteSchema } from "@/lib/validation";

/** Owner creates a single-use invite link. No email is sent. */
export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "members:manage");
  if (denied) return denied;

  const parsed = validate(inviteSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const { email, role, title } = parsed.data;

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, memberships: { select: { firmId: true } } },
  });
  if (existingUser?.memberships.length) {
    return jsonError("That person already belongs to a firm. One firm per user is supported.", 409);
  }

  const member = await prisma.membership.findFirst({
    where: { firmId: user.firmId, user: { email } },
    select: { id: true },
  });
  if (member) return jsonError("That person is already on your team.", 409);

  try {
    const token = generateInviteToken();
    const invitation = await prisma.invitation.create({
      data: {
        firmId: user.firmId,
        email,
        role,
        title: title || null,
        tokenHash: hashInviteToken(token),
        invitedById: user.id,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    });

    // Invitation is single-use; revoke older pending links for the same address.
    await prisma.invitation.deleteMany({
      where: {
        firmId: user.firmId,
        email,
        acceptedAt: null,
        id: { not: invitation.id },
      },
    });

    await recordAudit({
      firmId: user.firmId,
      actorId: user.id,
      action: "member.invited",
      entityType: "invitation",
      entityId: invitation.id,
      metadata: { email, role, title: title ?? null },
    });

    return NextResponse.json(
      {
        ok: true,
        id: invitation.id,
        url: joinUrl(token),
        expiresAt: invitation.expiresAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error, "Could not create the invitation.");
  }
}
