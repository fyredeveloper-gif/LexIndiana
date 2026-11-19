import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { testDatabaseUrl } from "./helpers/database-url";
import { resetTestDatabase } from "./helpers/fixture";
import { postJson, TEST_PASSWORD } from "./helpers/http";
import { startNextServer, type RunningNextServer } from "./helpers/next-server";

let server: RunningNextServer | undefined;

beforeAll(async () => {
  await resetTestDatabase();
  server = await startNextServer({
    DATABASE_URL: testDatabaseUrl,
    REGISTRATION_MODE: "open",
  });
}, 150_000);

afterAll(async () => {
  await server?.stop();
  await prisma.$disconnect();
}, 30_000);

describe("open registration", () => {
  it("allows a second firm after the first owner already exists", async () => {
    if (!server) throw new Error("Next test server is not running");
    const { baseUrl } = server;

    const first = await postJson(baseUrl, "/api/auth/register", {
      name: "Open Owner One",
      firmName: "Open Firm One",
      email: "open-owner-one@test.example",
      password: TEST_PASSWORD,
    });
    expect(first.status).toBe(201);

    const registrationPageAfterFirst = await fetch(`${baseUrl}/register`);
    expect(registrationPageAfterFirst.status).toBe(200);
    expect(await registrationPageAfterFirst.text()).toContain("Create your workspace");

    const second = await postJson(baseUrl, "/api/auth/register", {
      name: "Open Owner Two",
      firmName: "Open Firm Two",
      email: "open-owner-two@test.example",
      password: TEST_PASSWORD,
    });
    expect(second.status).toBe(201);

    expect(await prisma.firm.count()).toBe(2);
    expect(await prisma.user.count()).toBe(2);
    const owners = await prisma.membership.findMany({
      where: { role: "OWNER" },
      select: { firmId: true },
    });
    expect(owners).toHaveLength(2);
    expect(new Set(owners.map((owner) => owner.firmId)).size).toBe(2);

    expect(await (await fetch(`${baseUrl}/register`)).status).toBe(200);
  }, 60_000);
});
