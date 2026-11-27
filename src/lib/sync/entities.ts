/**
 * Entities synced in Phase 2. Keeping this list explicit (instead of "every
 * model") is deliberate: sessions, invitations, audit logs and uploaded file
 * metadata are device-local concerns, and company/tenant tables need ordering
 * because of foreign keys.
 */
export const SYNC_ENTITIES = [
  "Firm",
  "User",
  "Membership",
  "Contact",
  "Matter",
  "MatterContact",
  "Task",
  "CalendarEvent",
  "Deadline",
] as const;

export type SyncEntity = (typeof SYNC_ENTITIES)[number];

const ENTITY_SET: ReadonlySet<string> = new Set(SYNC_ENTITIES);

export function isSyncEntity(value: string): value is SyncEntity {
  return ENTITY_SET.has(value);
}

/** Parents before children, so a fresh peer can apply a bootstrap in order. */
export const SYNC_ORDER: readonly SyncEntity[] = SYNC_ENTITIES;

export const ENTITY_DELEGATE: Record<SyncEntity, string> = {
  Firm: "firm",
  User: "user",
  Membership: "membership",
  Contact: "contact",
  Matter: "matter",
  MatterContact: "matterContact",
  Task: "task",
  CalendarEvent: "calendarEvent",
  Deadline: "deadline",
};
