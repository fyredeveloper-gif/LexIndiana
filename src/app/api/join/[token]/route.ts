import { NextResponse } from "next/server";
import {
  forbidden,
  jsonError,
  notFound,
  parseJsonBody,
  requireSameOrigin,
  validate,
} from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { createSession, getSessionUser, hashPassword } from "@/lib/auth";
import { getInvitationByToken } from "@/lib/firm";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { joinSchema } from "@/lib/validation";

/**
 * Accept a staff invitation. The invited email is authoritative; the role was
 * fixed by the owner at invite time and cannot be escalated here.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const { token } = await params;
  const invitation = await getInvitationByToken(token);
  if (!invitation) return notFound("This invitation is invalid, expired, or already used.");

  const session = await getSessionUser();
  if (session) {
    if (session.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return forbidden();
    }
    return jsonError("You already belong to a firm. One firm per user is supported.", 409);
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limit = rateLimit(`join:${forwarded}`, 10, 60 * 60 * 1000);
  if (!limit.ok) return jsonError("Too many attempts. Try again later.", 429);

  const parsed = validate(joinSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const existing = await prisma.user.findUnique({
    where: { email: invitation.email },
    select: { id: true },
  });
  if (existing) {
    return jsonError("An account already exists for this address. Sign in before accepting.", 409);
  }

  const passwordHash = await hashPassword(parsed.data.password);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count === 0) throw new Error("INVITATION_ALREADY_USED");

      const user = await tx.user.create({
        data: {
          email: invitation.email,
          passwordHash,
          name: parsed.data.name,
        },
        select: { id: true },
      });

      await tx.membership.create({
        data: {
          firmId: invitation.firmId,
          userId: user.id,
          role: invitation.role,
          title: invitation.title,
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedById: user.id },
      });

      return user;
    });

    await recordAudit({
      firmId: invitation.firmId,
      actorId: created.id,
      action: "member.joined",
      entityType: "membership",
      entityId: created.id,
      metadata: { email: invitation.email, role: invitation.role, invitationId: invitation.id },
    });

    await createSession(created.id, request.headers.get("user-agent"));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVITATION_ALREADY_USED") {
      return notFound("This invitation has already been used.");
    }
    console.error("[join]", error);
    return jsonError("Could not accept the invitation.", 500);
  }
}
