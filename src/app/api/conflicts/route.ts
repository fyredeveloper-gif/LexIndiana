import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { requireCapability, unauthResponse } from "@/lib/api";
import { runConflictSearch } from "@/lib/data";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "conflict:read");
  if (denied) return denied;

  const query = new URL(request.url).searchParams.get("q") ?? "";
  const results = await runConflictSearch(user, query);
  return NextResponse.json(results);
}
