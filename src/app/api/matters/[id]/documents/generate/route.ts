import { NextResponse } from "next/server";
import {
  handleApiError,
  jsonError,
  notFound,
  parseJsonBody,
  requireCapability,
  requireSameOrigin,
  unauthResponse,
  validate,
} from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { renderDocx } from "@/lib/docx";
import { buildMergeValues } from "@/lib/merge";
import { prisma } from "@/lib/prisma";
import { assertOwnedKey, getObject, matterObjectKey, putObject } from "@/lib/storage";
import { DOCUMENT_MIME_TYPES } from "@/lib/utils";
import { generateDocumentSchema } from "@/lib/validation";

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "document"
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "document:write");
  if (denied) return denied;

  const { id } = await params;
  const parsed = validate(generateDocumentSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const matter = await prisma.matter.findFirst({
    where: { id, firmId: user.firmId },
    include: { client: true, parties: { include: { contact: { select: { name: true } } } } },
  });
  if (!matter) return notFound("Matter not found.");

  const template = await prisma.documentTemplate.findFirst({
    where: { id: parsed.data.templateId, firmId: user.firmId },
    select: { id: true, name: true, storageKey: true },
  });
  if (!template) return jsonError("Select a template from your library.", 400);

  try {
    const templateBuffer = await getObject(assertOwnedKey(user.firmId, template.storageKey));
    const values = buildMergeValues(
      user,
      matter,
      matter.client,
      matter.parties.map((party) => ({ role: party.role, name: party.contact.name })),
    );

    const rendered = renderDocx(templateBuffer, values);
    const fileName = `${slugify(matter.title)}-${slugify(template.name)}-${todayISO()}.docx`;
    const key = matterObjectKey(user.firmId, matter.id, fileName);
    const size = await putObject(key, rendered, DOCUMENT_MIME_TYPES.docx);

    const document = await prisma.matterDocument.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        matterId: matter.id,
        templateId: template.id,
        fileName,
        storageKey: key,
        mimeType: DOCUMENT_MIME_TYPES.docx,
        size,
        kind: "GENERATED",
      },
      select: { id: true, fileName: true },
    });

    return NextResponse.json({ ok: true, id: document.id, fileName: document.fileName }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Could not generate the document. Check your template placeholders.");
  }
}
