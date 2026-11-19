import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonError, requireCapability, requireSameOrigin, unauthResponse } from "@/lib/api";
import { isValidDocx } from "@/lib/docx";
import { prisma } from "@/lib/prisma";
import { MAX_UPLOAD_MB, putObject, safeFileName, templateObjectKey, MAX_UPLOAD_BYTES } from "@/lib/storage";
import { DOCUMENT_MIME_TYPES, fileExtension } from "@/lib/utils";

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "template:write");
  if (denied) return denied;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Upload a .docx template.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Choose a .docx file to upload.", 400);
  if (file.size > MAX_UPLOAD_BYTES) return jsonError(`Templates must be smaller than ${MAX_UPLOAD_MB} MB.`, 413);

  const fileName = safeFileName(file.name);
  if (fileExtension(fileName) !== "docx") return jsonError("Templates must be .docx files.", 415);

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isValidDocx(buffer)) return jsonError("That file is not a valid .docx document.", 415);

  const rawName = String(form.get("name") ?? "").trim();
  const name = (rawName || fileName.replace(/\.docx$/i, "")).slice(0, 120);
  const description = String(form.get("description") ?? "").trim().slice(0, 500) || null;

  try {
    const key = templateObjectKey(user.firmId, fileName);
    const size = await putObject(key, buffer, DOCUMENT_MIME_TYPES.docx);

    const template = await prisma.documentTemplate.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        name,
        description,
        fileName,
        storageKey: key,
        size,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: template.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Could not save the template.");
  }
}
