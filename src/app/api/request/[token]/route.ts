import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { handleApiError, jsonError, notFound, parseJsonBody, requireSameOrigin, validate } from "@/lib/api";
import { splitPartyNames, toConflictSnapshot } from "@/lib/conflicts";
import { screenConflicts } from "@/lib/data";
import { formatDateLong, todayISO } from "@/lib/dates";
import {
  buildIntakeMatterTitle,
  generateIntakeReference,
  hashClientIp,
  isPlausibleIntakeToken,
} from "@/lib/intake";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { intakeSubmissionSchema } from "@/lib/validation";

/**
 * PUBLIC endpoint. No session is required, so every response must be neutral:
 * it never reveals whether a conflict was found, who matched, or what matter
 * (if any) was created. The token belongs to a firm, not a person.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const { token } = await params;
  if (!isPlausibleIntakeToken(token)) return notFound("This intake link is not valid.");

  const firm = await prisma.firm.findFirst({
    where: { intakeToken: token, intakeEnabled: true },
    select: { id: true, name: true },
  });
  if (!firm) return notFound("This intake link is not valid.");

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const ipHash = hashClientIp(forwarded);

  const perVisitor = rateLimit(`intake:${firm.id}:${ipHash}`, 5, 15 * 60 * 1000);
  if (!perVisitor.ok) {
    return jsonError("Too many submissions from this connection. Please try again later or call the firm.", 429);
  }
  const perFirm = rateLimit(`intake-firm:${firm.id}`, 30, 60 * 60 * 1000);
  if (!perFirm.ok) {
    return jsonError("This intake form is temporarily unavailable. Please try again later.", 429);
  }

  const rawBody = await parseJsonBody(request);

  // Honeypot: silently accept and store nothing.
  if (
    rawBody &&
    typeof rawBody === "object" &&
    typeof (rawBody as { website?: unknown }).website === "string" &&
    (rawBody as { website: string }).website.trim().length > 0
  ) {
    return NextResponse.json({ ok: true, reference: null }, { status: 201 });
  }

  const parsed = validate(intakeSubmissionSchema, rawBody);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  try {
    // `mode: "insensitive"` is a PostgreSQL-only filter, so compare normalized
    // addresses in application code. Client emails are lowercased on write, but
    // imported contacts may not be, hence the explicit lowercase compare.
    const candidateClients = await prisma.contact.findMany({
      where: { firmId: firm.id, type: "CLIENT", email: { not: null } },
      select: { id: true, name: true, email: true },
    });
    const existingContact =
      candidateClients.find((contact) => contact.email?.toLowerCase() === input.email.toLowerCase()) ?? null;

    const terms = [
      input.name,
      input.email,
      input.organization ?? "",
      ...splitPartyNames(input.opposingParties),
    ].filter(Boolean);

    const screen = await screenConflicts(firm.id, terms, {
      excludeContactIds: existingContact ? [existingContact.id] : [],
      excludeClientId: existingContact?.id,
    });
    const snapshot = toConflictSnapshot(screen);

    let reference = generateIntakeReference();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const clash = await prisma.intakeSubmission.findFirst({
        where: { firmId: firm.id, reference },
        select: { id: true },
      });
      if (!clash) break;
      reference = generateIntakeReference();
    }

    const conflictLine =
      screen.status === "REVIEW"
        ? "Conflict screening flagged possible matches — review this submission before contacting the applicant."
        : `Conflict screening clear (${screen.scannedContacts} contacts, ${screen.scannedMatters} matters scanned).`;

    const matterNotes = [
      `Public intake ${reference} received ${formatDateLong(todayISO())}.`,
      `Email: ${input.email} | Phone: ${input.phone}${input.organization ? ` | Organization: ${input.organization}` : ""}`,
      "",
      "Summary:",
      input.summary,
      input.opposingParties ? `\nOpposing parties: ${input.opposingParties}` : "",
      input.referralSource ? `\nReferral source: ${input.referralSource}` : "",
      "",
      conflictLine,
    ]
      .filter(Boolean)
      .join("\n");

    const matterTitle = buildIntakeMatterTitle(input.name, input.practiceArea, input.opposingParties);

    const submission = await prisma.$transaction(async (tx) => {
      const contact = existingContact
        ? { id: existingContact.id }
        : await tx.contact.create({
            data: {
              firmId: firm.id,
              userId: null,
              type: "CLIENT",
              name: input.name,
              email: input.email,
              phone: input.phone,
              organization: input.organization,
              notes: `Created from public intake ${reference}.`,
            },
            select: { id: true },
          });

      const matter = await tx.matter.create({
        data: {
          firmId: firm.id,
          userId: null,
          clientId: contact.id,
          title: matterTitle,
          county: input.county,
          practiceArea: input.practiceArea,
          status: "INTAKE",
          notes: matterNotes,
        },
        select: { id: true },
      });

      return tx.intakeSubmission.create({
        data: {
          firmId: firm.id,
          userId: null,
          reference,
          name: input.name,
          email: input.email,
          phone: input.phone,
          organization: input.organization,
          county: input.county,
          practiceArea: input.practiceArea,
          summary: input.summary,
          opposingParties: input.opposingParties,
          referralSource: input.referralSource,
          conflictStatus: screen.status,
          conflictMatches: snapshot as unknown as Prisma.InputJsonValue,
          conflictCheckedAt: new Date(),
          status: "NEW",
          contactId: contact.id,
          matterId: matter.id,
          ipHash,
        },
        select: { id: true, reference: true },
      });
    });

    return NextResponse.json({ ok: true, reference: submission.reference }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "We could not record your request. Please call the firm instead.");
  }
}
