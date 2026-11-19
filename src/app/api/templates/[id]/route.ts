import { NextResponse } from "next/server";
import { notFound, requireCapability, requireSameOrigin, unauthorized, unauthResponse } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertOwnedKey, deleteObject, getObject } from "@/lib/storage";
import { fileResponse } from "@/lib/download";
import { DOCUMENT_MIME_TYPES } from "@/lib/utils";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const denied = requireCapability(user.role, "template:read");
  if (denied) return denied;

  const { id } = await params;
  const template = await prisma.documentTemplate.findFirst({
    where: { id, firmId: user.firmId },
    select: { fileName: true, storageKey: true },
  });
  if (!template) return notFound("Template not found.");

  const key = assertOwnedKey(user.firmId, template.storageKey);
  const buffer = await getObject(key);
  return fileResponse(buffer, template.fileName, DOCUMENT_MIME_TYPES.docx);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "template:write");
  if (denied) return denied;

  const { id } = await params;
  const template = await prisma.documentTemplate.findFirst({
    where: { id, firmId: user.firmId },
    select: { id: true, storageKey: true },
  });
  if (!template) return notFound("Template not found.");

  await prisma.documentTemplate.delete({ where: { id: template.id } });
  await deleteObject(assertOwnedKey(user.firmId, template.storageKey));
  return NextResponse.json({ ok: true });
}
