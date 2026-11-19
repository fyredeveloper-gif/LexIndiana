import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { requireSameOrigin } from "@/lib/api";

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  await destroySession();
  return NextResponse.json({ ok: true });
}
