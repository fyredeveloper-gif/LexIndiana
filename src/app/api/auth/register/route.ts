import { NextResponse } from "next/server";
import { createSession, hashPassword } from "@/lib/auth";
import { jsonError, parseJsonBody, requireSameOrigin, validate } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getRegistrationAccess, REGISTRATION_CLOSED_REASON } from "@/lib/registration";
import { registerSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

class BootstrapClosedError extends Error {}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const registration = await getRegistrationAccess();
  if (!registration.allowed) {
    return jsonError(registration.reason ?? "Registration is closed.", 403);
  }

  const parsed = validate(registerSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limit = rateLimit(`register:${forwarded}`, 10, 60 * 60 * 1000);
  if (!limit.ok) {
    return jsonError("Too many sign-up attempts. Try again later.", 429);
  }

  const { name, email, password, firmName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return jsonError("An account with that email already exists.", 409);
  }

  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.$transaction(async (tx) => {
      if (registration.mode === "bootstrap") {
        // Serialize first-owner attempts so two concurrent requests cannot both
        // observe an empty database and create separate firms.
        await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('lex_indiana_bootstrap'))");
        const firmCount = await tx.firm.count();
        if (firmCount > 0) throw new BootstrapClosedError();
      }

      const firm = await tx.firm.create({
        data: { name: firmName?.trim() || `${name} Law` },
        select: { id: true },
      });
      const created = await tx.user.create({
        data: { name, email, passwordHash },
        select: { id: true },
      });
      await tx.membership.create({
        data: { firmId: firm.id, userId: created.id, role: "OWNER" },
      });
      return created;
    });

    await createSession(user.id, request.headers.get("user-agent"));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof BootstrapClosedError) {
      return jsonError(REGISTRATION_CLOSED_REASON, 403);
    }
    console.error("[register]", error);
    return jsonError("Could not create the account.", 500);
  }
}
