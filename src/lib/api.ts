import type { StaffRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z, ZodError, type ZodType } from "zod";
import { can, type Capability } from "@/lib/permissions";

export function jsonError(message: string, status = 400, details?: unknown): NextResponse {
  return NextResponse.json({ error: message, details: details ?? null }, { status });
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Authentication required." }, { status: 401 });
}

export const unauthResponse = unauthorized;

export function forbidden(): NextResponse {
  return NextResponse.json({ error: "You do not have access to this resource." }, { status: 403 });
}

/**
 * API-side role gate. Pair with firm-scoped data access, never instead of it.
 * Consultants get a 404 on every unshared resource so their walls do not reveal
 * whether a matter, invoice, contact, or intake exists.
 */
export function requireCapability(role: StaffRole, capability: Capability): NextResponse | null {
  if (can(role, capability)) return null;
  return role === "CONSULTANT" ? notFound() : forbidden();
}

export function notFound(message = "Not found."): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function validate<TSchema extends ZodType>(
  schema: TSchema,
  data: unknown,
): { ok: true; data: z.output<TSchema> } | { ok: false; response: NextResponse } {
  try {
    return { ok: true, data: schema.parse(data) };
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues[0]?.message ?? "Invalid request body.";
      return { ok: false, response: jsonError(message, 422, error.issues) };
    }
    return { ok: false, response: jsonError("Invalid request body.", 422) };
  }
}

export function handleApiError(error: unknown, fallback = "Something went wrong."): NextResponse {
  if (error instanceof Error && error.message === "STORAGE_KEY_OUTSIDE_TENANT") {
    return forbidden();
  }
  console.error("[api]", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser clients / same-origin fetches without Origin
  try {
    const originHost = new URL(origin).host;
    const requestHost = request.headers.get("host");
    return originHost === requestHost;
  } catch {
    return false;
  }
}

export function requireSameOrigin(request: Request): NextResponse | null {
  if (!sameOrigin(request)) {
    return forbidden();
  }
  return null;
}
