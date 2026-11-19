import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/auth";

/** Staff invitation tokens are 256-bit secrets; only the hash is persisted. */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return sha256(token);
}

/** Relative on purpose: the copy UI resolves it against the browser's current origin. */
export function joinUrl(token: string): string {
  return `/join/${token}`;
}

export async function getFirmProfile(firmId: string) {
  return prisma.firm.findUnique({
    where: { id: firmId },
    select: { id: true, name: true, address: true, phone: true, email: true, createdAt: true },
  });
}

export type FirmMember = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  title: string | null;
  joinedAt: string;
};

export async function getFirmMembers(firmId: string): Promise<FirmMember[]> {
  const members = await prisma.membership.findMany({
    where: { firmId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return members.map((member) => ({
    membershipId: member.id,
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    role: member.role,
    title: member.title,
    joinedAt: member.createdAt.toISOString(),
  }));
}

export async function getFirmMemberOptions(firmId: string): Promise<Array<{ userId: string; name: string; role: string }>> {
  const members = await prisma.membership.findMany({
    where: { firmId },
    orderBy: { createdAt: "asc" },
    select: { userId: true, role: true, user: { select: { name: true } } },
  });
  return members.map((member) => ({ userId: member.userId, name: member.user.name, role: member.role }));
}

export async function getFirmConsultants(firmId: string) {
  return prisma.membership.findMany({
    where: { firmId, role: "CONSULTANT" },
    select: { userId: true, user: { select: { name: true, email: true } } },
  });
}

export async function getPendingInvitations(firmId: string) {
  const invitations = await prisma.invitation.findMany({
    where: { firmId, acceptedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      createdAt: true,
      invitedBy: { select: { name: true } },
    },
  });
  return invitations.map((invitation) => ({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
    invitedByName: invitation.invitedBy.name,
  }));
}

export async function getInvitationByToken(rawToken: string) {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(rawToken)) return null;
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashInviteToken(rawToken) },
    include: { firm: { select: { id: true, name: true } } },
  });
  if (!invitation) return null;
  if (invitation.acceptedAt) return null;
  if (invitation.expiresAt.getTime() <= Date.now()) return null;
  return invitation;
}

export async function getAuditEntries(firmId: string, limit = 100) {
  const entries = await prisma.auditLog.findMany({
    where: { firmId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { name: true } } },
  });
  return entries.map((entry) => ({
    id: entry.id,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    metadata: entry.metadata,
    actorName: entry.actor?.name ?? "Public intake",
    createdAt: entry.createdAt.toISOString(),
  }));
}

export async function getMatterAccess(matterId: string) {
  const rows = await prisma.matterAccess.findMany({
    where: { matterId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((row) => ({
    userId: row.userId,
    name: row.user.name,
    email: row.user.email,
    grantedAt: row.createdAt.toISOString(),
  }));
}
