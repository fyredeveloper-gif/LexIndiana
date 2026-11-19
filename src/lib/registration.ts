import { prisma } from "@/lib/prisma";

export type RegistrationMode = "open" | "bootstrap" | "closed";

export type RegistrationAccess = {
  mode: RegistrationMode;
  allowed: boolean;
  bootstrap: boolean;
  reason: string | null;
};

export const REGISTRATION_CLOSED_REASON =
  "Registration is closed. Ask your firm owner for an invitation.";

export function parseRegistrationMode(value = process.env.REGISTRATION_MODE): RegistrationMode {
  const mode = (value ?? "bootstrap").trim().toLowerCase();
  return mode === "open" || mode === "closed" ? mode : "bootstrap";
}

/**
 * `bootstrap` permits exactly the first firm. Once any firm exists, it behaves
 * like `closed`; an operator can still opt into public registration with
 * `REGISTRATION_MODE=open`.
 */
export function registrationAllowed(mode: RegistrationMode, firmCount: number): boolean {
  if (mode === "open") return true;
  if (mode === "closed") return false;
  return firmCount === 0;
}

export async function getRegistrationAccess(): Promise<RegistrationAccess> {
  const mode = parseRegistrationMode();

  if (mode === "open") {
    return { mode, allowed: true, bootstrap: false, reason: null };
  }
  if (mode === "closed") {
    return { mode, allowed: false, bootstrap: false, reason: REGISTRATION_CLOSED_REASON };
  }

  try {
    const firmCount = await prisma.firm.count();
    const allowed = registrationAllowed(mode, firmCount);
    return {
      mode,
      allowed,
      bootstrap: allowed,
      reason: allowed ? null : REGISTRATION_CLOSED_REASON,
    };
  } catch {
    // Fail closed on an unavailable registration lookup; login must still render.
    return { mode, allowed: false, bootstrap: false, reason: "Registration is unavailable right now." };
  }
}
