import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { notFound, parseJsonBody, requireCapability, requireSameOrigin, unauthResponse, validate } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { invoiceStatusSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "invoice:manage");
  if (denied) return denied;

  const { id } = await params;
  const parsed = validate(invoiceStatusSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const updated = await prisma.invoice.updateMany({
    where: { id, firmId: user.firmId },
    data: { status: parsed.data.status },
  });
  if (updated.count === 0) return notFound("Invoice not found.");

  return NextResponse.json({ ok: true });
}
