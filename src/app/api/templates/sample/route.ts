import { NextResponse } from "next/server";
import { handleApiError, requireCapability, requireSameOrigin, unauthResponse } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { buildSampleTemplateDocx } from "@/lib/docx";
import { prisma } from "@/lib/prisma";
import { putObject, templateObjectKey } from "@/lib/storage";
import { DOCUMENT_MIME_TYPES } from "@/lib/utils";

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "template:write");
  if (denied) return denied;

  try {
    const buffer = buildSampleTemplateDocx();
    const fileName = "entry-of-appearance-sample.docx";
    const key = templateObjectKey(user.firmId, fileName);
    const size = await putObject(key, buffer, DOCUMENT_MIME_TYPES.docx);

    const template = await prisma.documentTemplate.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        name: "Entry of Appearance (sample)",
        description:
          "Indiana pleading template with a firm header, caption, cause number, and signature block. Replace or extend the placeholder tags as needed.",
        fileName,
        storageKey: key,
        size,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: template.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Could not install the sample template.");
  }
}
