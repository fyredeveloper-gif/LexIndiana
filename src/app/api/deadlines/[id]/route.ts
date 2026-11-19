import { NextResponse } from "next/server";
import { notFound, parseJsonBody, requireCapability, requireSameOrigin, unauthResponse, validate } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deadlineUpdateSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "deadline:write");
  if (denied) return denied;

  const { id } = await params;
  const parsed = validate(deadlineUpdateSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const data: Record<string, unknown> = {};
  if (parsed.data.completed !== undefined) data.completed = parsed.data.completed;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes || null;

  const updated = await prisma.deadline.updateMany({ where: { id, firmId: user.firmId }, data });
  if (updated.count === 0) return notFound("Deadline not found.");

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "deadline:write");
  if (denied) return denied;

  const { id } = await params;
  const deleted = await prisma.deadline.deleteMany({ where: { id, firmId: user.firmId } });
  if (deleted.count === 0) return notFound("Deadline not found.");

  return NextResponse.json({ ok: true });
}
