import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { testDatabaseUrl } from "./helpers/database-url";
import { createFixture, resetTestDatabase, type Fixture } from "./helpers/fixture";
import { postJson, sessionCookie, TEST_PASSWORD } from "./helpers/http";
import { startNextServer, type RunningNextServer } from "./helpers/next-server";

let fixture: Fixture;
let server: RunningNextServer | undefined;

beforeAll(async () => {
  await resetTestDatabase();
  fixture = await createFixture();

  // The fixture normally uses a placeholder hash; this account is used for a
  // real password check through /api/auth/login.
  await prisma.user.update({
    where: { id: fixture.users.ownerA.id },
    data: { passwordHash: await bcrypt.hash(TEST_PASSWORD, 4) },
  });

  server = await startNextServer({
    DATABASE_URL: testDatabaseUrl,
    REGISTRATION_MODE: "bootstrap",
  });
}, 150_000);

afterAll(async () => {
  await server?.stop();
  await prisma.$disconnect();
}, 30_000);

describe("real cookie and session path", () => {
  it("logs in, issues an HTTP session cookie, creates an invite, and accepts it end to end", async () => {
    if (!server) throw new Error("Next test server is not running");
    const { baseUrl } = server;

    const login = await postJson(baseUrl, "/api/auth/login", {
      email: fixture.users.ownerA.email,
      password: TEST_PASSWORD,
    });
    expect(login.status).toBe(200);

    const ownerCookie = sessionCookie(login);
    const ownerSetCookie = login.headers.get("set-cookie") ?? "";
    expect(ownerSetCookie).toMatch(/HttpOnly/i);
    expect(ownerSetCookie).toMatch(/SameSite=lax/i);

    const invitation = await postJson(
      baseUrl,
      "/api/firm/invitations",
      {
        email: "e2e-invited@test.example",
        role: "PARALEGAL",
        title: "E2E hire",
      },
      ownerCookie,
    );
    expect(invitation.status).toBe(201);
    const invitationBody = (await invitation.json()) as { url: string };
    expect(invitationBody.url).toMatch(/^\/join\//);

    const accepted = await postJson(baseUrl, `/api/join/${invitationBody.url.split("/").pop()}`, {
      name: "E2E Invited Paralegal",
      password: TEST_PASSWORD,
    });
    expect(accepted.status).toBe(201);

    const invitedCookie = sessionCookie(accepted);
    expect(invitedCookie).not.toBe(ownerCookie);

    const contacts = await fetch(`${baseUrl}/api/contacts`, {
      headers: { cookie: invitedCookie },
    });
    expect(contacts.status).toBe(200);

    const denied = await postJson(
      baseUrl,
      "/api/firm/invitations",
      { email: "another@test.example", role: "CONSULTANT" },
      invitedCookie,
    );
    expect(denied.status).toBe(403);

    const membership = await prisma.membership.findFirstOrThrow({
      where: { user: { email: "e2e-invited@test.example" } },
      select: { firmId: true, role: true, title: true },
    });
    expect(membership).toEqual({
      firmId: fixture.firmA.id,
      role: "PARALEGAL",
      title: "E2E hire",
    });
  }, 60_000);
});

describe("first-owner bootstrap", () => {
  it("allows one owner on an empty deployment, then closes the page and API", async () => {
    if (!server) throw new Error("Next test server is not running");

    await resetTestDatabase();
    const { baseUrl } = server;

    const bootstrapPage = await fetch(`${baseUrl}/register`);
    expect(bootstrapPage.status).toBe(200);
    expect(await bootstrapPage.text()).toContain("Create the first workspace");

    const first = await postJson(baseUrl, "/api/auth/register", {
      name: "First E2E Owner",
      firmName: "First E2E Firm",
      email: "first-e2e-owner@test.example",
      password: TEST_PASSWORD,
    });
    expect(first.status).toBe(201);
    expect(first.headers.get("set-cookie")).toMatch(/lex_session=/);

    const firstOwner = await prisma.membership.findFirstOrThrow({
      where: { user: { email: "first-e2e-owner@test.example" } },
      select: { role: true, firm: { select: { name: true } } },
    });
    expect(firstOwner).toEqual({ role: "OWNER", firm: { name: "First E2E Firm" } });
    expect(await prisma.firm.count()).toBe(1);

    const second = await postJson(baseUrl, "/api/auth/register", {
      name: "Second E2E Owner",
      firmName: "Second E2E Firm",
      email: "second-e2e-owner@test.example",
      password: TEST_PASSWORD,
    });
    expect(second.status).toBe(403);
    await expect(second.json()).resolves.toMatchObject({
      error: "Registration is closed. Ask your firm owner for an invitation.",
    });

    const closedPage = await fetch(`${baseUrl}/register`);
    expect(closedPage.status).toBe(404);
    expect(await prisma.firm.count()).toBe(1);
    expect(
      await prisma.user.count({ where: { email: "second-e2e-owner@test.example" } }),
    ).toBe(0);
  }, 60_000);

  it("allows exactly one of two simultaneous bootstrap registrations", async () => {
    if (!server) throw new Error("Next test server is not running");

    await resetTestDatabase();
    const { baseUrl } = server;

    const [first, second] = await Promise.all([
      postJson(baseUrl, "/api/auth/register", {
        name: "Concurrent Owner A",
        firmName: "Concurrent Firm A",
        email: "concurrent-owner-a@test.example",
        password: TEST_PASSWORD,
      }),
      postJson(baseUrl, "/api/auth/register", {
        name: "Concurrent Owner B",
        firmName: "Concurrent Firm B",
        email: "concurrent-owner-b@test.example",
        password: TEST_PASSWORD,
      }),
    ]);

    expect([first.status, second.status].sort((a, b) => a - b)).toEqual([201, 403]);
    expect(await prisma.firm.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.membership.count({ where: { role: "OWNER" } })).toBe(1);

    const rejected = first.status === 403 ? first : second;
    await expect(rejected.json()).resolves.toMatchObject({
      error: "Registration is closed. Ask your firm owner for an invitation.",
    });

    expect(await (await fetch(`${baseUrl}/register`)).status).toBe(404);
  }, 60_000);
});
