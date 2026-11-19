import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  jsonError,
  handleApiError,
  parseJsonBody,
  requireCapability,
  requireSameOrigin,
  unauthResponse,
  validate,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { matterSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "matter:write");
  if (denied) return denied;

  const parsed = validate(matterSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const client = await prisma.contact.findFirst({
    where: { id: parsed.data.clientId, firmId: user.firmId },
    select: { id: true, type: true },
  });
  if (!client) return jsonError("Select a client from your contact list.", 400);
  if (client.type !== "CLIENT") return jsonError("The primary client must be a contact of type Client.", 400);

  try {
    const matter = await prisma.matter.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        clientId: client.id,
        title: parsed.data.title,
        causeNumber: parsed.data.causeNumber,
        county: parsed.data.county,
        courtName: parsed.data.courtName,
        practiceArea: parsed.data.practiceArea,
        status: parsed.data.status,
        notes: parsed.data.notes,
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, id: matter.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Could not open the matter.");
  }
}
