import { z } from "zod";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { notFound, parseJsonBody, requireCapability, requireSameOrigin, unauthResponse, validate } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const schema = z.object({ description: z.string().trim().max(1000).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "time:own");
  if (denied) return denied;

  const { id } = await params;
  const parsed = validate(schema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const entry = await prisma.timeEntry.findFirst({
    where: { id, firmId: user.firmId, userId: user.id, startedAt: { not: null }, endedAt: null },
    select: { id: true, startedAt: true, description: true },
  });
  if (!entry?.startedAt) return notFound("Running timer not found.");

  const elapsedMinutes = Math.max(1, Math.round((Date.now() - entry.startedAt.getTime()) / 60_000));

  await prisma.timeEntry.update({
    where: { id: entry.id },
    data: {
      endedAt: new Date(),
      durationMinutes: elapsedMinutes,
      description: parsed.data.description?.trim() || entry.description,
    },
  });

  return NextResponse.json({ ok: true, minutes: elapsedMinutes });
}
