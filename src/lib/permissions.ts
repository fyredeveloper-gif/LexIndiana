import type { StaffRole } from "@prisma/client";

/**
 * Central staff authorization matrix. Every page and API route asks this module
 * before touching firm data; the data layer independently scopes by firmId.
 */
export type Capability =
  | "firm:profile"
  | "members:manage"
  | "members:view"
  | "audit:view"
  | "intake:configure"
  | "intake:view"
  | "intake:triage"
  | "intake:decide"
  | "conflict:read"
  | "matter:read"
  | "matter:write"
  | "matter:share"
  | "contact:read"
  | "contact:write"
  | "deadline:read"
  | "deadline:write"
  | "task:read"
  | "task:write"
  | "calendar:read"
  | "calendar:write"
  | "time:own"
  | "time:view_all"
  | "time:edit_all"
  | "invoice:read"
  | "invoice:manage"
  | "template:read"
  | "template:write"
  | "document:read"
  | "document:write"
  | "consultant:share";

const OWNER: Capability[] = [
  "firm:profile",
  "members:manage",
  "members:view",
  "audit:view",
  "intake:configure",
  "intake:view",
  "intake:triage",
  "intake:decide",
  "conflict:read",
  "matter:read",
  "matter:write",
  "matter:share",
  "contact:read",
  "contact:write",
  "deadline:read",
  "deadline:write",
  "task:read",
  "task:write",
  "calendar:read",
  "calendar:write",
  "time:own",
  "time:view_all",
  "time:edit_all",
  "invoice:read",
  "invoice:manage",
  "template:read",
  "template:write",
  "document:read",
  "document:write",
  "consultant:share",
];

export const ROLE_CAPABILITIES: Record<StaffRole, Capability[]> = {
  OWNER,
  ATTORNEY: OWNER.filter(
    (capability) =>
      capability !== "members:manage" &&
      capability !== "members:view" &&
      capability !== "audit:view" &&
      capability !== "firm:profile" &&
      capability !== "intake:configure",
  ),
  PARALEGAL: [
    "intake:view",
    "intake:triage",
    "conflict:read",
    "matter:read",
    "matter:write",
    "contact:read",
    "contact:write",
    "deadline:read",
    "deadline:write",
    "task:read",
    "task:write",
    "calendar:read",
    "calendar:write",
    "time:own",
    "template:read",
    "template:write",
    "document:read",
    "document:write",
  ],
  CLM: [
    "firm:profile",
    "members:view",
    "audit:view",
    "intake:view",
    "intake:triage",
    "matter:read",
    "contact:read",
    "deadline:read",
    "task:read",
    "calendar:read",
    "time:own",
    "time:view_all",
    "invoice:read",
    "invoice:manage",
    "template:read",
    "document:read",
  ],
  CONSULTANT: ["matter:read", "deadline:read", "task:read", "calendar:read", "document:read"],
};

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  OWNER: "Owner",
  ATTORNEY: "Attorney",
  PARALEGAL: "Paralegal",
  CLM: "Practice manager",
  CONSULTANT: "Consultant",
};

export const STAFF_ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  OWNER: "Full access, plus firm administration, members, and the intake link.",
  ATTORNEY: "Full legal and billing work, including intake decisions.",
  PARALEGAL: "Matters, contacts, deadlines, tasks, calendar, documents, own time, intake triage.",
  CLM: "Billing, time review, intake queue, firm profile, tasks and calendar read-only; legal records read-only.",
  CONSULTANT: "Read-only access to tasks, calendar, and matters explicitly shared with them.",
};

export function can(role: StaffRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function canAny(role: StaffRole, capabilities: Capability[]): boolean {
  return capabilities.some((capability) => can(role, capability));
}

/** Intake decisions (convert/decline) are reserved for lawyers. */
export function canDecideIntake(role: StaffRole): boolean {
  return can(role, "intake:decide");
}
