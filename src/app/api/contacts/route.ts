import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  handleApiError,
  parseJsonBody,
  requireCapability,
  requireSameOrigin,
  unauthResponse,
  validate,
} from "@/lib/api";
import { parseAliases, serializeAliases } from "@/lib/aliases";
import { prisma } from "@/lib/prisma";
import { contactSchema } from "@/lib/validation";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "contact:read");
  if (denied) return denied;

  const contacts = await prisma.contact.findMany({
    where: { firmId: user.firmId },
    orderBy: { name: "asc" },
    select: { id: true, type: true, name: true, aliases: true, organization: true },
  });
  return NextResponse.json({
    contacts: contacts.map((contact) => ({ ...contact, aliases: parseAliases(contact.aliases) })),
  });
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "contact:write");
  if (denied) return denied;

  const parsed = validate(contactSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  try {
    const contact = await prisma.contact.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        type: parsed.data.type,
        name: parsed.data.name,
        aliases: serializeAliases(parsed.data.aliases),
        email: parsed.data.email,
        phone: parsed.data.phone,
        organization: parsed.data.organization,
        address: parsed.data.address,
        notes: parsed.data.notes,
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, id: contact.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Could not save the contact.");
  }
}
