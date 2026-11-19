import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AuditAction =
  | "member.invited"
  | "member.role_changed"
  | "member.removed"
  | "member.joined"
  | "ownership.transferred"
  | "intake.status_changed"
  | "intake.assigned"
  | "intake.note_updated"
  | "intake.token_rotated"
  | "intake.settings_changed"
  | "conflict.reviewed"
  | "matter.access_granted"
  | "matter.access_revoked";

/** Security/ethics-relevant events only; this table is append-only. */
export async function recordAudit(entry: {
  firmId: string;
  actorId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        firmId: entry.firmId,
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        metadata: entry.metadata,
      },
    })
    .catch((error) => {
      // An audit failure must not break the business action, but it must be visible.
      console.error("[audit] failed to record", entry.action, error);
    });
}
