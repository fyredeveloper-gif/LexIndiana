import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createFixture,
  resetTestDatabase,
  type Fixture,
} from "./helpers/fixture";

const auth = vi.hoisted(() => ({
  session: null as SessionUser | null,
  sessionsCreated: [] as string[],
}));

vi.mock("@/lib/auth", async () => {
  const { createHash } = await import("node:crypto");
  return {
    getSessionUser: async () => auth.session,
    createSession: async (userId: string) => {
      auth.sessionsCreated.push(userId);
    },
    hashPassword: async (password: string) => `test-hash:${password}`,
    sha256: (value: string) => createHash("sha256").update(value).digest("hex"),
  };
});

import { GET as getContactsRoute } from "@/app/api/contacts/route";
import { POST as inviteRoute } from "@/app/api/firm/invitations/route";
import { PATCH as patchMemberRoute } from "@/app/api/firm/members/[id]/route";
import { PATCH as patchIntakeRoute } from "@/app/api/intake/[id]/route";
import { POST as createInvoiceRoute } from "@/app/api/invoices/route";
import { GET as invoicePdfRoute } from "@/app/api/invoices/[id]/pdf/route";
import { POST as joinRoute } from "@/app/api/join/[token]/route";
import { POST as grantAccessRoute, DELETE as revokeAccessRoute } from "@/app/api/matters/[id]/access/route";
import { PATCH as patchMatterRoute } from "@/app/api/matters/[id]/route";
import {
  getContacts,
  getDeadlines,
  getIntakeSubmission,
  getIntakeSubmissions,
  getInvoiceDetail,
  getMatterDetail,
  getMatterOptions,
  getMatters,
  getTimeEntries,
} from "@/lib/data";

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

beforeAll(async () => {
  await resetTestDatabase();
  fixture = await createFixture();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("consultant matter isolation", () => {
  it("lists only matters with an explicit grant", async () => {
    const matters = await getMatters(fixture.sessions.consultantA);
    expect(matters.map((matter) => matter.id)).toEqual([fixture.matters.assignedA.id]);

    const options = await getMatterOptions(fixture.sessions.consultantA);
    expect(options.map((matter) => matter.id)).toEqual([fixture.matters.assignedA.id]);
  });

  it("returns null for an unshared matter and the shared matter for a grant", async () => {
    expect(await getMatterDetail(fixture.sessions.consultantA, fixture.matters.unassignedA.id)).toBeNull();
    const assigned = await getMatterDetail(fixture.sessions.consultantA, fixture.matters.assignedA.id);
    expect(assigned?.id).toBe(fixture.matters.assignedA.id);
    expect(assigned?.invoices).toEqual([]);
    expect(assigned?.timeEntries).toEqual([]);
  });

  it("hides firm contacts, intake, time, invoices, and unrelated deadlines", async () => {
    expect(await getContacts(fixture.sessions.consultantA)).toEqual([]);
    expect(await getIntakeSubmissions(fixture.sessions.consultantA)).toEqual([]);
    expect(await getIntakeSubmission(fixture.sessions.consultantA, fixture.intakes.reviewA.id)).toBeNull();
    expect(await getTimeEntries(fixture.sessions.consultantA)).toEqual([]);
    expect(await getInvoiceDetail(fixture.sessions.consultantA, fixture.invoices.invoiceA.id)).toBeNull();

    const deadlines = await getDeadlines(fixture.sessions.consultantA);
    expect(deadlines.map((deadline) => deadline.title)).toEqual(["Assigned deadline"]);
  });

  it("returns 404 from consultant APIs rather than revealing existence", async () => {
    signIn(fixture.sessions.consultantA);

    expect((await getContactsRoute()).status).toBe(404);
    expect(
      (await invoicePdfRoute(jsonRequest("/api/invoices/x/pdf", "GET"), params({ id: fixture.invoices.invoiceA.id })))
        .status,
    ).toBe(404);
    expect(
      (
        await patchMatterRoute(
          jsonRequest(`/api/matters/${fixture.matters.assignedA.id}`, "PATCH", { title: "Nope" }),
          params({ id: fixture.matters.assignedA.id }),
        )
      ).status,
    ).toBe(404);
  });

  it("grants and revokes a shared matter through the owner-only admin route", async () => {
    signIn(fixture.sessions.ownerA);
    const grant = await grantAccessRoute(
      jsonRequest(`/api/matters/${fixture.matters.unassignedA.id}/access`, "POST", {
        userId: fixture.users.consultantA.id,
      }),
      params({ id: fixture.matters.unassignedA.id }),
    );
    expect(grant.status).toBe(201);
    expect(await getMatterDetail(fixture.sessions.consultantA, fixture.matters.unassignedA.id)).not.toBeNull();

    const revoke = await revokeAccessRoute(
      jsonRequest(
        `/api/matters/${fixture.matters.unassignedA.id}/access?userId=${fixture.users.consultantA.id}`,
        "DELETE",
      ),
      params({ id: fixture.matters.unassignedA.id }),
    );
    expect(revoke.status).toBe(200);
    expect(await getMatterDetail(fixture.sessions.consultantA, fixture.matters.unassignedA.id)).toBeNull();
  });

  it("does not let an owner share a matter from another firm", async () => {
    signIn(fixture.sessions.ownerA);
    const response = await grantAccessRoute(
      jsonRequest(`/api/matters/${fixture.matters.firmB.id}/access`, "POST", {
        userId: fixture.users.consultantA.id,
      }),
      params({ id: fixture.matters.firmB.id }),
    );
    expect(response.status).toBe(404);
  });
});

describe("firm role enforcement at the API boundary", () => {
  it("reserves invitations for the owner", async () => {
    signIn(fixture.sessions.attorneyA);
    const response = await inviteRoute(
      jsonRequest("/api/firm/invitations", "POST", {
        email: "new-hire@test.example",
        role: "PARALEGAL",
      }),
    );
    expect(response.status).toBe(403);
    expect(await prisma.invitation.count({ where: { email: "new-hire@test.example" } })).toBe(0);
  });

  it("lets the owner create a copyable invitation with a fixed role and title", async () => {
    signIn(fixture.sessions.ownerA);
    const response = await inviteRoute(
      jsonRequest("/api/firm/invitations", "POST", {
        email: "owner-created@test.example",
        role: "CLM",
        title: "Finance lead",
      }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { url: string; id: string };
    expect(body.url).toMatch(/^\/join\/[A-Za-z0-9_-]{20,}$/);

    const invitation = await prisma.invitation.findUniqueOrThrow({
      where: { id: body.id },
      select: { firmId: true, email: true, role: true, title: true, tokenHash: true },
    });
    expect(invitation).toMatchObject({
      firmId: fixture.firmA.id,
      email: "owner-created@test.example",
      role: "CLM",
      title: "Finance lead",
    });
    expect(invitation.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reserves member role changes for the owner", async () => {
    const membership = await prisma.membership.findFirstOrThrow({
      where: { userId: fixture.users.paralegalA.id },
      select: { id: true },
    });
    signIn(fixture.sessions.attorneyA);
    const response = await patchMemberRoute(
      jsonRequest(`/api/firm/members/${membership.id}`, "PATCH", { role: "CLM" }),
      params({ id: membership.id }),
    );
    expect(response.status).toBe(403);
    expect(
      (await prisma.membership.findUniqueOrThrow({ where: { id: membership.id } })).role,
    ).toBe("PARALEGAL");
  });

  it("blocks paralegal billing but lets the practice manager reach invoice validation", async () => {
    signIn(fixture.sessions.paralegalA);
    expect((await createInvoiceRoute(jsonRequest("/api/invoices", "POST", {}))).status).toBe(403);

    signIn(fixture.sessions.clmA);
    // 422 proves the role passed the capability gate; the payload is intentionally empty.
    expect((await createInvoiceRoute(jsonRequest("/api/invoices", "POST", {}))).status).toBe(422);
  });

  it("blocks practice-manager edits to legal records", async () => {
    signIn(fixture.sessions.clmA);
    const response = await patchMatterRoute(
      jsonRequest(`/api/matters/${fixture.matters.assignedA.id}`, "PATCH", { title: "Changed" }),
      params({ id: fixture.matters.assignedA.id }),
    );
    expect(response.status).toBe(403);
    expect(
      (await prisma.matter.findUniqueOrThrow({ where: { id: fixture.matters.assignedA.id } })).title,
    ).toBe("Assigned Alpha Matter");
  });

  it("blocks a paralegal from sharing a matter with a consultant", async () => {
    signIn(fixture.sessions.paralegalA);
    const response = await grantAccessRoute(
      jsonRequest(`/api/matters/${fixture.matters.assignedA.id}/access`, "POST", {
        userId: fixture.users.consultantA.id,
      }),
      params({ id: fixture.matters.assignedA.id }),
    );
    expect(response.status).toBe(403);
  });
});

describe("intake decisions", () => {
  it("lets paralegals triage but not convert or decline", async () => {
    signIn(fixture.sessions.paralegalA);
    const response = await patchIntakeRoute(
      jsonRequest(`/api/intake/${fixture.intakes.reviewA.id}`, "PATCH", { status: "CONVERTED" }),
      params({ id: fixture.intakes.reviewA.id }),
    );
    expect(response.status).toBe(403);
    expect(
      (await prisma.intakeSubmission.findUniqueOrThrow({ where: { id: fixture.intakes.reviewA.id } })).status,
    ).toBe("NEW");
  });

  it("lets the practice manager triage but not decide", async () => {
    signIn(fixture.sessions.clmA);
    const response = await patchIntakeRoute(
      jsonRequest(`/api/intake/${fixture.intakes.reviewA.id}`, "PATCH", { status: "DECLINED" }),
      params({ id: fixture.intakes.reviewA.id }),
    );
    expect(response.status).toBe(403);
  });

  it("does not expose intake to consultants", async () => {
    signIn(fixture.sessions.consultantA);
    const response = await patchIntakeRoute(
      jsonRequest(`/api/intake/${fixture.intakes.reviewA.id}`, "PATCH", { internalNote: "x" }),
      params({ id: fixture.intakes.reviewA.id }),
    );
    expect(response.status).toBe(404);
  });

  it("lets an attorney contact, assign, then decline with a conflict-review audit", async () => {
    signIn(fixture.sessions.attorneyA);

    const contacted = await patchIntakeRoute(
      jsonRequest(`/api/intake/${fixture.intakes.reviewA.id}`, "PATCH", {
        status: "CONTACTED",
        assignedToId: fixture.users.paralegalA.id,
        internalNote: "Conflict check reviewed with the owner.",
      }),
      params({ id: fixture.intakes.reviewA.id }),
    );
    expect(contacted.status).toBe(200);

    const stored = await prisma.intakeSubmission.findUniqueOrThrow({
      where: { id: fixture.intakes.reviewA.id },
      select: { status: true, assignedToId: true, internalNote: true },
    });
    expect(stored).toEqual({
      status: "CONTACTED",
      assignedToId: fixture.users.paralegalA.id,
      internalNote: "Conflict check reviewed with the owner.",
    });

    const declined = await patchIntakeRoute(
      jsonRequest(`/api/intake/${fixture.intakes.reviewA.id}`, "PATCH", { status: "DECLINED" }),
      params({ id: fixture.intakes.reviewA.id }),
    );
    expect(declined.status).toBe(200);

    const audits = await prisma.auditLog.findMany({
      where: { firmId: fixture.firmA.id, entityId: fixture.intakes.reviewA.id },
      select: { action: true },
    });
    expect(audits.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["intake.assigned", "intake.note_updated", "intake.status_changed", "conflict.reviewed"]),
    );
  });

  it("cannot decide an intake belonging to another firm", async () => {
    signIn(fixture.sessions.ownerA);
    const response = await patchIntakeRoute(
      jsonRequest(`/api/intake/${fixture.intakes.firmB.id}`, "PATCH", { status: "CONVERTED" }),
      params({ id: fixture.intakes.firmB.id }),
    );
    expect(response.status).toBe(404);
    expect(
      (await prisma.intakeSubmission.findUniqueOrThrow({ where: { id: fixture.intakes.firmB.id } })).status,
    ).toBe("NEW");
  });
});

describe("invitation acceptance", () => {
  it("creates a single-use account with the invitation's fixed role and title", async () => {
    signIn(null);
    auth.sessionsCreated.length = 0;

    const response = await joinRoute(
      jsonRequest(`/api/join/${fixture.invitations.validToken}`, "POST", {
        name: "Invited Paralegal",
        password: "TestPassword123",
      }),
      params({ token: fixture.invitations.validToken }),
    );
    expect(response.status).toBe(201);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: fixture.invitations.validEmail },
      select: { id: true, memberships: { select: { firmId: true, role: true, title: true } } },
    });
    expect(user.memberships).toEqual([
      { firmId: fixture.firmA.id, role: "PARALEGAL", title: "Litigation support" },
    ]);
    expect(auth.sessionsCreated).toEqual([user.id]);

    const invitation = await prisma.invitation.findFirstOrThrow({
      where: { email: fixture.invitations.validEmail },
      select: { acceptedAt: true, acceptedById: true },
    });
    expect(invitation.acceptedAt).not.toBeNull();
    expect(invitation.acceptedById).toBe(user.id);

    const replay = await joinRoute(
      jsonRequest(`/api/join/${fixture.invitations.validToken}`, "POST", {
        name: "Someone Else",
        password: "TestPassword123",
      }),
      params({ token: fixture.invitations.validToken }),
    );
    expect(replay.status).toBe(404);
    expect(await prisma.user.count({ where: { email: fixture.invitations.validEmail } })).toBe(1);
  });

  it("rejects an expired invitation", async () => {
    signIn(null);
    const response = await joinRoute(
      jsonRequest(`/api/join/${fixture.invitations.expiredToken}`, "POST", {
        name: "Expired Person",
        password: "TestPassword123",
      }),
      params({ token: fixture.invitations.expiredToken }),
    );
    expect(response.status).toBe(404);
    expect(await prisma.user.count({ where: { email: fixture.invitations.expiredEmail } })).toBe(0);
  });

  it("cannot escalate the invited role through the request body", async () => {
    signIn(null);
    const token = "escalation-token-with-enough-characters";
    await prisma.invitation.create({
      data: {
        firmId: fixture.firmA.id,
        email: "escalation@test.example",
        role: "CONSULTANT",
        tokenHash: (await import("./helpers/fixture")).tokenHash(token),
        invitedById: fixture.users.ownerA.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const response = await joinRoute(
      jsonRequest(`/api/join/${token}`, "POST", {
        name: "Escalation Attempt",
        password: "TestPassword123",
        role: "OWNER",
      }),
      params({ token }),
    );
    expect(response.status).toBe(201);
    expect(
      (
        await prisma.user.findUniqueOrThrow({
          where: { email: "escalation@test.example" },
          select: { memberships: { select: { role: true } } },
        })
      ).memberships[0].role,
    ).toBe("CONSULTANT");
  });
});

describe("cross-firm isolation", () => {
  it("scopes every data-layer lookup to the signed-in firm", async () => {
    const ownerA = fixture.sessions.ownerA;

    expect(await getMatterDetail(ownerA, fixture.matters.firmB.id)).toBeNull();
    expect(await getInvoiceDetail(ownerA, fixture.invoices.invoiceB.id)).toBeNull();
    expect(await getIntakeSubmission(ownerA, fixture.intakes.firmB.id)).toBeNull();
    expect((await getMatters(ownerA)).map((matter) => matter.id)).not.toContain(fixture.matters.firmB.id);
    expect((await getContacts(ownerA)).map((contact) => contact.name)).not.toContain(fixture.contacts.clientB.name);

    expect(await getMatterDetail(fixture.sessions.ownerB, fixture.matters.assignedA.id)).toBeNull();
  });

  it("returns 404 when an owner edits or downloads another firm's records", async () => {
    signIn(fixture.sessions.ownerA);

    const patch = await patchMatterRoute(
      jsonRequest(`/api/matters/${fixture.matters.firmB.id}`, "PATCH", { title: "Cross-firm edit" }),
      params({ id: fixture.matters.firmB.id }),
    );
    expect(patch.status).toBe(404);

    const pdf = await invoicePdfRoute(
      jsonRequest(`/api/invoices/${fixture.invoices.invoiceB.id}/pdf`, "GET"),
      params({ id: fixture.invoices.invoiceB.id }),
    );
    expect(pdf.status).toBe(404);

    expect(
      (await prisma.matter.findUniqueOrThrow({ where: { id: fixture.matters.firmB.id } })).title,
    ).toBe("Beta Confidential Matter");
  });
});
