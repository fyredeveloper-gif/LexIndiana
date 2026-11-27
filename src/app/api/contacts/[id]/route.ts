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
import { serializeAliases } from "@/lib/aliases";
import { prisma } from "@/lib/prisma";
import { contactUpdateSchema } from "@/lib/validation";

function normalizeAliases(value: string[] | string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const list = Array.isArray(value) ? value : value.split(",");
  return list.map((alias) => alias.trim()).filter(Boolean).slice(0, 25);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "contact:write");
  if (denied) return denied;

  const { id } = await params;
  const parsed = validate(contactUpdateSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const existing = await prisma.contact.findFirst({ where: { id, firmId: user.firmId }, select: { id: true } });
  if (!existing) return notFound("Contact not found.");

  const input = parsed.data;
  const data: Record<string, unknown> = {};
  if (input.type !== undefined) data.type = input.type;
  if (input.name !== undefined) data.name = input.name;
  if (input.aliases !== undefined) data.aliases = serializeAliases(normalizeAliases(input.aliases));
  if (input.email !== undefined) data.email = input.email || null;
  if (input.phone !== undefined) data.phone = input.phone || null;
  if (input.organization !== undefined) data.organization = input.organization || null;
  if (input.address !== undefined) data.address = input.address || null;
  if (input.notes !== undefined) data.notes = input.notes || null;

  await prisma.contact.update({ where: { id: existing.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "contact:write");
  if (denied) return denied;

  const { id } = await params;
  const contact = await prisma.contact.findFirst({
    where: { id, firmId: user.firmId },
    select: { id: true, _count: { select: { clientOfMatters: true } } },
  });
  if (!contact) return notFound("Contact not found.");
  if (contact._count.clientOfMatters > 0) {
    return jsonError("This contact is the primary client on one or more matters and cannot be deleted.", 409);
  }

  await prisma.contact.delete({ where: { id: contact.id } });
  return NextResponse.json({ ok: true });
}
