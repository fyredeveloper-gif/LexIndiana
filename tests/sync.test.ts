import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, rawPrisma } from "@/lib/prisma";
import { applyRemoteOperation } from "@/lib/sync/apply";
import { flushCaptures } from "@/lib/sync/capture";
import { buildBootstrapOps } from "@/lib/sync/engine";
import { parsePayload, prepareForWrite, serializePayload } from "@/lib/sync/payload";
import { createFixture, resetTestDatabase, type Fixture } from "./helpers/fixture";

let fixture: Fixture;

beforeAll(async () => {
  await resetTestDatabase();
  fixture = await createFixture();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function newTask(title: string) {
  return prisma.task.create({
    data: {
      firmId: fixture.firmA.id,
      matterId: fixture.matters.assignedA.id,
      assigneeId: fixture.users.ownerA.id,
      createdById: fixture.users.ownerA.id,
      title,
    },
  });
}

function remoteUpdate(task: Record<string, unknown>, title: string, offsetMs: number): string {
  return JSON.stringify({
    ...task,
    title,
    updatedAt: new Date(Date.now() + offsetMs).toISOString(),
  });
}

describe("sync payloads", () => {
  it("never serialises password hashes or 2FA seeds", async () => {
    const user = await rawPrisma.user.findUniqueOrThrow({ where: { id: fixture.users.ownerA.id } });
    const payload = parsePayload(serializePayload("User", user));

    expect(payload).not.toBeNull();
    expect(payload).not.toHaveProperty("passwordHash");
    expect(payload).not.toHaveProperty("twoFactorSecret");
    expect(payload?.email).toBe(user.email);
  });

  it("gives mirrored accounts an unusable local password", () => {
    const create = prepareForWrite("User", { id: "u1", passwordHash: "secret", twoFactorSecret: "seed" }, "create");
    expect(create.passwordHash).toBe("!synced-account-no-local-login");
    expect(create).not.toHaveProperty("twoFactorSecret");

    const update = prepareForWrite("User", { id: "u1", name: "Renamed" }, "update");
    expect(update).not.toHaveProperty("id");
    expect(update).not.toHaveProperty("passwordHash");
  });

  it("round-trips dates and JSON columns through JSON text", async () => {
    const contact = await rawPrisma.contact.findUniqueOrThrow({ where: { id: fixture.contacts.clientA.id } });
    const payload = parsePayload(serializePayload("Contact", contact));
    expect(typeof payload?.createdAt).toBe("string");
    expect(Number.isNaN(new Date(String(payload?.createdAt)).getTime())).toBe(false);
  });
});

describe("automatic change capture", () => {
  it("records a create made through the extended Prisma client", async () => {
    const task = await newTask("Captured task");
    await flushCaptures();
    const operations = await rawPrisma.syncOperation.findMany({
      where: { entity: "Task", entityId: task.id },
    });

    expect(operations).toHaveLength(1);
    expect(operations[0].operation).toBe("CREATE");
    const payload = parsePayload(operations[0].payload);
    expect(payload?.title).toBe("Captured task");
    expect(operations[0].deviceId).toBe(process.env.LEX_DEVICE_ID ?? "web");
  });

  it("records updates and deletes, and leaves a tombstone", async () => {
    const task = await newTask("To be removed");
    await prisma.task.update({ where: { id: task.id }, data: { title: "Renamed" } });
    await prisma.task.delete({ where: { id: task.id } });
    await flushCaptures();

    const operations = await rawPrisma.syncOperation.findMany({
      where: { entity: "Task", entityId: task.id },
    });
    const kinds = operations.map((op) => op.operation);
    expect(kinds).toContain("CREATE");
    expect(kinds).toContain("UPDATE");
    expect(kinds).toContain("DELETE");

    const tombstone = await rawPrisma.syncTombstone.findUnique({
      where: {
        firmId_entity_entityId: { firmId: fixture.firmA.id, entity: "Task", entityId: task.id },
      },
    });
    expect(tombstone).not.toBeNull();
  });

  it("captures bulk updates and deletes", async () => {
    const task = await newTask("Bulk target");
    await prisma.task.updateMany({
      where: { id: task.id, firmId: fixture.firmA.id },
      data: { priority: "HIGH" },
    });
    await prisma.task.deleteMany({ where: { id: task.id, firmId: fixture.firmA.id } });
    await flushCaptures();

    const operations = await rawPrisma.syncOperation.findMany({
      where: { entity: "Task", entityId: task.id },
      orderBy: { createdAt: "asc" },
    });
    expect(operations.at(-1)?.operation).toBe("DELETE");
    expect(operations.some((op) => op.operation === "UPDATE")).toBe(true);
  });

  it("does not capture remote applies, which use the raw client", async () => {
    await flushCaptures();
    const before = await rawPrisma.syncOperation.count();
    await rawPrisma.task.create({
      data: {
        firmId: fixture.firmA.id,
        createdById: fixture.users.ownerA.id,
        title: "Raw write",
      },
    });
    await flushCaptures();
    expect(await rawPrisma.syncOperation.count()).toBe(before);
  });
});

describe("applying remote operations", () => {
  it("upserts a newer remote edit without re-capturing it", async () => {
    const task = await rawPrisma.task.create({
      data: {
        firmId: fixture.firmA.id,
        createdById: fixture.users.ownerA.id,
        title: "Local version",
      },
    });
    await flushCaptures();
    const result = await applyRemoteOperation(rawPrisma, {
      firmId: fixture.firmA.id,
      deviceId: "peer",
      entity: "Task",
      entityId: task.id,
      operation: "UPDATE",
      payload: remoteUpdate(task, "Remote version", 60_000),
    });

    expect(result.status).toBe("applied");
    const updated = await rawPrisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.title).toBe("Remote version");
    await flushCaptures();
    expect(
      await rawPrisma.syncOperation.count({ where: { entity: "Task", entityId: task.id } }),
    ).toBe(0);
  });

  it("keeps the local edit when it is newer and still unsynced", async () => {
    const task = await newTask("Unsaved local edit");
    await flushCaptures();
    const result = await applyRemoteOperation(rawPrisma, {
      firmId: fixture.firmA.id,
      deviceId: "peer",
      entity: "Task",
      entityId: task.id,
      operation: "UPDATE",
      payload: remoteUpdate(task, "Stale remote edit", -60_000),
    });

    expect(result.status).toBe("conflict");
    expect(result.localPayload).toContain("Unsaved local edit");
    const unchanged = await rawPrisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(unchanged.title).toBe("Unsaved local edit");
  });

  it("deletes, tombstones, and refuses to resurrect the record", async () => {
    const task = await rawPrisma.task.create({
      data: {
        firmId: fixture.firmA.id,
        createdById: fixture.users.ownerA.id,
        title: "Delete me remotely",
      },
    });
    const deleted = await applyRemoteOperation(rawPrisma, {
      firmId: fixture.firmA.id,
      deviceId: "peer",
      entity: "Task",
      entityId: task.id,
      operation: "DELETE",
      payload: null,
    });
    expect(deleted.status).toBe("applied");
    expect(await rawPrisma.task.findUnique({ where: { id: task.id } })).toBeNull();
    expect(
      await rawPrisma.syncTombstone.findUnique({
        where: {
          firmId_entity_entityId: { firmId: fixture.firmA.id, entity: "Task", entityId: task.id },
        },
      }),
    ).not.toBeNull();

    const lateCreate = await applyRemoteOperation(rawPrisma, {
      firmId: fixture.firmA.id,
      deviceId: "peer",
      entity: "Task",
      entityId: task.id,
      operation: "CREATE",
      payload: JSON.stringify({ ...task, updatedAt: new Date(Date.now() - 60_000).toISOString() }),
    });
    expect(lateCreate.status).toBe("skipped");
    expect(await rawPrisma.task.findUnique({ where: { id: task.id } })).toBeNull();
  });

  it("reports a retry when a parent record has not arrived yet", async () => {
    const result = await applyRemoteOperation(rawPrisma, {
      firmId: fixture.firmA.id,
      deviceId: "peer",
      entity: "Task",
      entityId: "missing-parent-task",
      operation: "CREATE",
      payload: JSON.stringify({
        id: "missing-parent-task",
        firmId: fixture.firmA.id,
        matterId: "does-not-exist",
        createdById: fixture.users.ownerA.id,
        title: "Orphan",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });
    expect(result.status).toBe("retry");
  });
});

describe("bootstrap snapshot", () => {
  it("emits parents first and never includes credentials", async () => {
    const ops = await buildBootstrapOps(rawPrisma, fixture.firmA.id, "client-a");

    expect(ops.length).toBeGreaterThan(0);
    const entities = ops.map((op) => op.entity);
    expect(entities[0]).toBe("Firm");
    expect(entities.indexOf("Matter")).toBeLessThan(entities.indexOf("Task"));
    expect(entities.filter((entity) => entity === "Firm")).toHaveLength(1);

    for (const op of ops.filter((entry) => entry.entity === "User")) {
      expect(op.payload).not.toContain("passwordHash");
      expect(op.payload).not.toContain("twoFactorSecret");
    }
  });
});
