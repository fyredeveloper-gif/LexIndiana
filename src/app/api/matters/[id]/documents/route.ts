import { NextResponse } from "next/server";
import { handleApiError, jsonError, notFound, requireCapability, requireSameOrigin, unauthResponse } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isValidDocx } from "@/lib/docx";
import { prisma } from "@/lib/prisma";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, matterObjectKey, putObject, safeFileName } from "@/lib/storage";
import { DOCUMENT_MIME_TYPES, fileExtension } from "@/lib/utils";

const ALLOWED = new Set(["docx", "pdf", "txt", "png", "jpg", "jpeg"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "document:write");
  if (denied) return denied;

  const { id } = await params;
  const matter = await prisma.matter.findFirst({ where: { id, firmId: user.firmId }, select: { id: true } });
  if (!matter) return notFound("Matter not found.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Choose a file to upload.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Choose a file to upload.", 400);
  if (file.size > MAX_UPLOAD_BYTES) return jsonError(`Files must be smaller than ${MAX_UPLOAD_MB} MB.`, 413);

  const fileName = safeFileName(file.name);
  const extension = fileExtension(fileName);
  if (!ALLOWED.has(extension)) {
    return jsonError("Allowed file types: .docx, .pdf, .txt, .png, .jpg.", 415);
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (extension === "docx" && !isValidDocx(buffer)) {
      return jsonError("That file is not a valid .docx document.", 415);
    }
    const mimeType = DOCUMENT_MIME_TYPES[extension] ?? "application/octet-stream";
    const key = matterObjectKey(user.firmId, matter.id, fileName);
    const size = await putObject(key, buffer, mimeType);

    const document = await prisma.matterDocument.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        matterId: matter.id,
        fileName,
        storageKey: key,
        mimeType,
        size,
        kind: "UPLOAD",
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: document.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Could not save the document.");
  }
}
