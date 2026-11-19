import { describe, expect, it } from "vitest";
import type { StaffRole } from "@prisma/client";
import type { Capability } from "@/lib/permissions";
import { ROLE_CAPABILITIES, canDecideIntake } from "@/lib/permissions";

/**
 * This is intentionally an exhaustive snapshot, not a sample. A role change
 * that widens access must update this test and the README matrix together.
 */
const EXPECTED: Record<StaffRole, Capability[]> = {
  OWNER: [
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
  ],
  ATTORNEY: [
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
  ],
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

const ALL_CAPABILITIES = Object.keys(EXPECTED) as StaffRole[];

describe("staff capability matrix", () => {
  it.each(ALL_CAPABILITIES)("matches the approved capability set for %s", (role) => {
    expect([...ROLE_CAPABILITIES[role]].sort()).toEqual([...EXPECTED[role]].sort());
  });

  it.each([
    ["OWNER", true],
    ["ATTORNEY", true],
    ["PARALEGAL", false],
    ["CLM", false],
    ["CONSULTANT", false],
  ] as const)("canDecideIntake(%s) is %s", (role, expected) => {
    expect(canDecideIntake(role)).toBe(expected);
  });
});
