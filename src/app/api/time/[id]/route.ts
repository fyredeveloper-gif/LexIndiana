import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { jsonError, notFound, requireCapability, requireSameOrigin, unauthResponse } from "@/lib/api";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "time:own");
  if (denied) return denied;

  const { id } = await params;
  const entry = await prisma.timeEntry.findFirst({
    where: {
      id,
      firmId: user.firmId,
      ...(can(user.role, "time:edit_all") ? {} : { userId: user.id }),
    },
    select: { id: true, invoiceId: true },
  });
  if (!entry) return notFound("Time entry not found.");
  if (entry.invoiceId) return jsonError("This entry has already been invoiced and cannot be deleted.", 409);

  await prisma.timeEntry.delete({ where: { id: entry.id } });
  return NextResponse.json({ ok: true });
}
