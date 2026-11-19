import { NextResponse } from "next/server";
import { notFound, requireCapability, requireSameOrigin, unauthorized, unauthResponse } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertOwnedKey, deleteObject, getObject } from "@/lib/storage";
import { fileResponse } from "@/lib/download";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const denied = requireCapability(user.role, "document:read");
  if (denied) return denied;

  const { id } = await params;
  const document = await prisma.matterDocument.findFirst({
    where: {
      id,
      firmId: user.firmId,
      ...(user.role === "CONSULTANT"
        ? { matter: { access: { some: { userId: user.id } } } }
        : {}),
    },
    select: { fileName: true, storageKey: true, mimeType: true },
  });
  if (!document) return notFound("Document not found.");

  // Server-side authorization has already run; the key prefix is re-verified so a
  // tampered row can never read outside this tenant's root.
  const key = assertOwnedKey(user.firmId, document.storageKey);
  const buffer = await getObject(key);
  return fileResponse(buffer, document.fileName, document.mimeType);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "document:write");
  if (denied) return denied;

  const { id } = await params;
  const document = await prisma.matterDocument.findFirst({
    where: { id, firmId: user.firmId },
    select: { id: true, storageKey: true },
  });
  if (!document) return notFound("Document not found.");

  await prisma.matterDocument.delete({ where: { id: document.id } });
  await deleteObject(assertOwnedKey(user.firmId, document.storageKey));
  return NextResponse.json({ ok: true });
}
