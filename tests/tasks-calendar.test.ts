import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createFixture, resetTestDatabase, type Fixture } from "./helpers/fixture";

const auth = vi.hoisted(() => ({
  session: null as SessionUser | null,
}));

vi.mock("@/lib/auth", async () => {
  const { createHash } = await import("node:crypto");
  return {
    getSessionUser: async () => auth.session,
    createSession: async () => undefined,
    hashPassword: async (password: string) => `test-hash:${password}`,
    sha256: (value: string) => createHash("sha256").update(value).digest("hex"),
  };
});

import { DELETE as deleteEventRoute, PATCH as patchEventRoute } from "@/app/api/calendar/[id]/route";
import { POST as createEventRoute } from "@/app/api/calendar/route";
import { PATCH as patchTaskRoute } from "@/app/api/tasks/[id]/route";
import { POST as createTaskRoute } from "@/app/api/tasks/route";
import { getCalendarEvents } from "@/lib/calendar";
import { getMatterTasks, getTasks } from "@/lib/tasks";

function signIn(session: SessionUser | null) {
  auth.session = session;
}

function jsonRequest(path: string, method: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function params<T extends Record<string, string>>(value: T): { params: Promise<T> } {
  return { params: Promise.resolve(value) };
}

let fixture: Fixture;
let assignedTaskId: string;
let unassignedTaskId: string;

beforeAll(async () => {
  await resetTestDatabase();
  fixture = await createFixture();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("tasks and calendar permissions", () => {
  it("creates tasks for the owner and keeps matter references inside the firm", async () => {
    signIn(fixture.sessions.ownerA);
    const response = await createTaskRoute(
      jsonRequest("/api/tasks", "POST", {
        title: "Deposition prep",
        matterId: fixture.matters.assignedA.id,
        assigneeId: fixture.users.ownerA.id,
        dueDate: "2026-12-01",
        priority: "HIGH",
      }),
    );
    expect(response.status).toBe(201);
    assignedTaskId = ((await response.json()) as { id: string }).id;

    const unassigned = await createTaskRoute(
      jsonRequest("/api/tasks", "POST", {
        title: "Unshared matter task",
        matterId: fixture.matters.unassignedA.id,
        dueDate: "2026-12-02",
        priority: "MEDIUM",
      }),
    );
    expect(unassigned.status).toBe(201);
    unassignedTaskId = ((await unassigned.json()) as { id: string }).id;

    const crossFirm = await createTaskRoute(
      jsonRequest("/api/tasks", "POST", {
        title: "Wrong firm",
        matterId: fixture.matters.firmB.id,
      }),
    );
    expect(crossFirm.status).toBe(400);
    expect(await prisma.task.count({ where: { title: "Wrong firm" } })).toBe(0);
  });

  it("scopes consultant task reads to shared matters and hides firm-wide work", async () => {
    const consultantTasks = await getTasks(fixture.sessions.consultantA);
    expect(consultantTasks.map((task) => task.id)).toEqual([assignedTaskId]);
    expect(await getMatterTasks(fixture.sessions.consultantA, fixture.matters.assignedA.id)).toHaveLength(1);

    const matterTasks = await getMatterTasks(fixture.sessions.consultantA, fixture.matters.unassignedA.id);
    expect(matterTasks).toEqual([]);

    // Assignment is not an access grant: a task on an unshared matter stays hidden.
    await prisma.task.create({
      data: {
        firmId: fixture.firmA.id,
        matterId: fixture.matters.unassignedA.id,
        createdById: fixture.users.ownerA.id,
        assigneeId: fixture.users.consultantA.id,
        title: "Unshared assignment",
      },
    });
    expect((await getTasks(fixture.sessions.consultantA)).map((task) => task.id)).toEqual([
      assignedTaskId,
    ]);
  });

  it("allows staff to complete a task but keeps practice managers read-only", async () => {
    signIn(fixture.sessions.ownerA);
    const complete = await patchTaskRoute(
      jsonRequest(`/api/tasks/${assignedTaskId}`, "PATCH", { completed: true }),
      params({ id: assignedTaskId }),
    );
    expect(complete.status).toBe(200);

    const stored = await prisma.task.findUniqueOrThrow({ where: { id: assignedTaskId } });
    expect(stored.completed).toBe(true);
    expect(stored.completedAt).not.toBeNull();

    signIn(fixture.sessions.clmA);
    const forbidden = await createTaskRoute(
      jsonRequest("/api/tasks", "POST", { title: "Practice manager task" }),
    );
    expect(forbidden.status).toBe(403);

    signIn(fixture.sessions.consultantA);
    const hidden = await createTaskRoute(
      jsonRequest("/api/tasks", "POST", { title: "Consultant task" }),
    );
    expect(hidden.status).toBe(404);
    expect(await prisma.task.count({ where: { title: "Consultant task" } })).toBe(0);
  });

  it("creates calendar events, scopes them to shared matters, and enforces time order", async () => {
    signIn(fixture.sessions.ownerA);
    const eventResponse = await createEventRoute(
      jsonRequest("/api/calendar", "POST", {
        title: "Status conference",
        type: "HEARING",
        matterId: fixture.matters.assignedA.id,
        startsAt: "2026-12-10T10:00",
        endsAt: "2026-12-10T10:30",
        location: "Marion Superior Court",
      }),
    );
    expect(eventResponse.status).toBe(201);
    const eventId = ((await eventResponse.json()) as { id: string }).id;

    const unshared = await createEventRoute(
      jsonRequest("/api/calendar", "POST", {
        title: "Unshared hearing",
        matterId: fixture.matters.unassignedA.id,
        startsAt: "2026-12-11T10:00",
      }),
    );
    expect(unshared.status).toBe(201);

    const invalidWindow = await createEventRoute(
      jsonRequest("/api/calendar", "POST", {
        title: "Bad window",
        startsAt: "2026-12-12T10:00",
        endsAt: "2026-12-12T09:00",
      }),
    );
    expect(invalidWindow.status).toBe(422);

    const consultantEvents = await getCalendarEvents(fixture.sessions.consultantA, {
      from: "2026-12-01",
      to: "2026-12-31",
    });
    expect(consultantEvents.map((event) => event.id)).toEqual([eventId]);

    const crossFirm = await createEventRoute(
      jsonRequest("/api/calendar", "POST", {
        title: "Wrong firm event",
        matterId: fixture.matters.firmB.id,
        startsAt: "2026-12-13T10:00",
      }),
    );
    expect(crossFirm.status).toBe(400);
    expect(await prisma.calendarEvent.count({ where: { title: "Wrong firm event" } })).toBe(0);

    signIn(fixture.sessions.ownerA);
    const remove = await deleteEventRoute(
      jsonRequest(`/api/calendar/${eventId}`, "DELETE"),
      params({ id: eventId }),
    );
    expect(remove.status).toBe(200);

    const update = await patchEventRoute(
      jsonRequest(`/api/calendar/${eventId}`, "PATCH", { title: "Deleted event" }),
      params({ id: eventId }),
    );
    expect(update.status).toBe(404);
  });

  it("edits task and event details in place", async () => {
    signIn(fixture.sessions.ownerA);
    const taskEdit = await patchTaskRoute(
      jsonRequest(`/api/tasks/${unassignedTaskId}`, "PATCH", {
        title: "Renamed task",
        description: "Updated notes",
        dueDate: "2026-12-20",
        priority: "URGENT",
        assigneeId: fixture.users.paralegalA.id,
      }),
      params({ id: unassignedTaskId }),
    );
    expect(taskEdit.status).toBe(200);

    const storedTask = await prisma.task.findUniqueOrThrow({ where: { id: unassignedTaskId } });
    expect(storedTask.title).toBe("Renamed task");
    expect(storedTask.description).toBe("Updated notes");
    expect(storedTask.dueDate?.toISOString().slice(0, 10)).toBe("2026-12-20");
    expect(storedTask.priority).toBe("URGENT");
    expect(storedTask.assigneeId).toBe(fixture.users.paralegalA.id);
    expect(storedTask.completed).toBe(false);

    const created = await createEventRoute(
      jsonRequest("/api/calendar", "POST", {
        title: "Hearing to move",
        type: "HEARING",
        matterId: fixture.matters.assignedA.id,
        startsAt: "2026-12-15T09:00",
        endsAt: "2026-12-15T09:30",
      }),
    );
    expect(created.status).toBe(201);
    const eventId = ((await created.json()) as { id: string }).id;

    const moved = await patchEventRoute(
      jsonRequest(`/api/calendar/${eventId}`, "PATCH", {
        title: "Hearing moved",
        startsAt: "2026-12-16T13:00",
        endsAt: "2026-12-16T14:00",
        location: "Courtroom 3",
      }),
      params({ id: eventId }),
    );
    expect(moved.status).toBe(200);

    const storedEvent = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: eventId } });
    expect(storedEvent.title).toBe("Hearing moved");
    expect(storedEvent.location).toBe("Courtroom 3");
    expect(storedEvent.startsAt.toISOString()).toBe("2026-12-16T18:00:00.000Z");
    expect(storedEvent.endsAt?.getTime()).toBe(storedEvent.startsAt.getTime() + 60 * 60 * 1000);

    const badWindow = await patchEventRoute(
      jsonRequest(`/api/calendar/${eventId}`, "PATCH", { startsAt: "2026-12-16T15:00" }),
      params({ id: eventId }),
    );
    expect(badWindow.status).toBe(422);

    const unchanged = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: eventId } });
    expect(unchanged.startsAt.toISOString()).toBe("2026-12-16T18:00:00.000Z");
  });

  it("keeps goal posts on the firm boundary when completing tasks", async () => {
    signIn(fixture.sessions.ownerB);
    const response = await patchTaskRoute(
      jsonRequest(`/api/tasks/${unassignedTaskId}`, "PATCH", { title: "Cross-firm edit" }),
      params({ id: unassignedTaskId }),
    );
    expect(response.status).toBe(404);
  });
});
