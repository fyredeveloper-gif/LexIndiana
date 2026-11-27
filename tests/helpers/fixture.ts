import { createHash, randomBytes } from "node:crypto";
import type { StaffRole } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type StaffSession = SessionUser;
export type FixtureUser = { id: string; email: string; name: string };

export type Fixture = {
  firmA: { id: string; name: string };
  firmB: { id: string; name: string };
  users: {
    ownerA: FixtureUser;
    attorneyA: FixtureUser;
    paralegalA: FixtureUser;
    clmA: FixtureUser;
    consultantA: FixtureUser;
    ownerB: FixtureUser;
  };
  sessions: {
    ownerA: StaffSession;
    attorneyA: StaffSession;
    paralegalA: StaffSession;
    clmA: StaffSession;
    consultantA: StaffSession;
    ownerB: StaffSession;
  };
  matters: {
    assignedA: { id: string; title: string };
    unassignedA: { id: string; title: string };
    firmB: { id: string; title: string };
  };
  contacts: {
    clientA: { id: string; name: string };
    clientB: { id: string; name: string };
  };
  invoices: {
    invoiceA: { id: string; number: string };
    invoiceB: { id: string; number: string };
  };
  intakes: {
    reviewA: { id: string; reference: string };
    firmB: { id: string; reference: string };
  };
  invitations: {
    validToken: string;
    validEmail: string;
    expiredToken: string;
    expiredEmail: string;
  };
};

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function resetTestDatabase(): Promise<void> {
  // SQLite has no TRUNCATE; deleting the tenants cascades to every child row.
  await prisma.$executeRawUnsafe('DELETE FROM "Firm"');
  await prisma.$executeRawUnsafe('DELETE FROM "User"');
}

function sessionFor(
  user: { id: string; email: string; name: string },
  firm: { id: string; name: string },
  role: StaffRole,
): StaffSession {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    indianaAttorneyNumber: null,
    defaultHourlyRate: 300,
    twoFactorEnabled: false,
    firmId: firm.id,
    firmName: firm.name,
    firmAddress: "1 Test Plaza",
    firmPhone: "(317) 555-0100",
    firmEmail: "office@test.example",
    role,
  };
}

export async function createFixture(): Promise<Fixture> {
  const firmA = await prisma.firm.create({
    data: {
      name: "Alpha Test Firm",
      address: "1 Test Plaza",
      phone: "(317) 555-0100",
      email: "office@alpha.test",
      intakeEnabled: true,
      intakeToken: `alpha-${randomBytes(24).toString("base64url")}`,
    },
    select: { id: true, name: true },
  });
  const firmB = await prisma.firm.create({
    data: { name: "Beta Test Firm", intakeToken: `beta-${randomBytes(24).toString("base64url")}` },
    select: { id: true, name: true },
  });

  const makeUser = async (email: string, name: string) =>
    prisma.user.create({
      data: { email, name, passwordHash: "test-only-hash" },
      select: { id: true, email: true, name: true },
    });

  const ownerAUser = await makeUser("owner-a@test.example", "Owner A");
  const attorneyAUser = await makeUser("attorney-a@test.example", "Attorney A");
  const paralegalAUser = await makeUser("paralegal-a@test.example", "Paralegal A");
  const clmUserA = await makeUser("clm-a@test.example", "CLM A");
  const consultantAUser = await makeUser("consultant-a@test.example", "Consultant A");
  const ownerBUser = await makeUser("owner-b@test.example", "Owner B");

  const addMembership = async (userId: string, firmId: string, role: StaffRole, title?: string) =>
    prisma.membership.create({ data: { userId, firmId, role, title: title ?? null } });

  await addMembership(ownerAUser.id, firmA.id, "OWNER");
  await addMembership(attorneyAUser.id, firmA.id, "ATTORNEY");
  await addMembership(paralegalAUser.id, firmA.id, "PARALEGAL");
  await addMembership(clmUserA.id, firmA.id, "CLM");
  await addMembership(consultantAUser.id, firmA.id, "CONSULTANT", "Outside reviewer");
  await addMembership(ownerBUser.id, firmB.id, "OWNER");

  const clientA = await prisma.contact.create({
    data: { firmId: firmA.id, type: "CLIENT", name: "Alpha Client" },
    select: { id: true, name: true },
  });
  const clientB = await prisma.contact.create({
    data: { firmId: firmB.id, type: "CLIENT", name: "Beta Client" },
    select: { id: true, name: true },
  });

  const addMatter = async (firmId: string, clientId: string, title: string) =>
    prisma.matter.create({
      data: { firmId, clientId, title, county: "Marion", practiceArea: "Civil Litigation", status: "ACTIVE" },
      select: { id: true, title: true },
    });

  const assignedA = await addMatter(firmA.id, clientA.id, "Assigned Alpha Matter");
  const unassignedA = await addMatter(firmA.id, clientA.id, "Unassigned Alpha Matter");
  const firmBMatter = await addMatter(firmB.id, clientB.id, "Beta Confidential Matter");

  await prisma.matterAccess.create({
    data: {
      matterId: assignedA.id,
      userId: consultantAUser.id,
      grantedById: ownerAUser.id,
    },
  });

  const addDeadline = async (firmId: string, userId: string, matterId: string, title: string) => {
    const dueDate = new Date("2026-12-15T00:00:00.000Z");
    return prisma.deadline.create({
      data: {
        firmId,
        userId,
        matterId,
        title,
        triggerEvent: "Test trigger",
        triggerDate: new Date("2026-11-15T00:00:00.000Z"),
        serviceMethod: "E_SERVICE",
        daysAdded: 0,
        dueDate,
      },
      select: { id: true },
    });
  };
  await addDeadline(firmA.id, ownerAUser.id, assignedA.id, "Assigned deadline");
  await addDeadline(firmA.id, ownerAUser.id, unassignedA.id, "Unassigned deadline");
  await addDeadline(firmB.id, ownerBUser.id, firmBMatter.id, "Beta deadline");

  const addInvoice = async (firmId: string, userId: string, matterId: string, number: string) =>
    prisma.invoice.create({
      data: {
        firmId,
        userId,
        matterId,
        number,
        issueDate: new Date("2026-11-01T00:00:00.000Z"),
        subtotal: 100,
        total: 100,
      },
      select: { id: true, number: true },
    });
  const invoiceA = await addInvoice(firmA.id, ownerAUser.id, assignedA.id, "INV-A-0001");
  const invoiceB = await addInvoice(firmB.id, ownerBUser.id, firmBMatter.id, "INV-B-0001");

  const addIntake = async (firmId: string, reference: string, name: string) =>
    prisma.intakeSubmission.create({
      data: {
        firmId,
        reference,
        name,
        email: `${reference.toLowerCase()}@applicant.test`,
        phone: "(317) 555-0199",
        county: "Marion",
        practiceArea: "Civil Litigation",
        summary: "A test intake submission with enough detail for screening.",
        conflictStatus: "REVIEW",
        conflictCheckedAt: new Date(),
        status: "NEW",
      },
      select: { id: true, reference: true },
    });
  const reviewA = await addIntake(firmA.id, "INT-ALPHA", "Alpha Applicant");
  const intakeB = await addIntake(firmB.id, "INT-BETA", "Beta Applicant");

  const validToken = randomBytes(32).toString("base64url");
  const expiredToken = randomBytes(32).toString("base64url");
  const validEmail = "invited-paralegal@test.example";
  const expiredEmail = "expired-invite@test.example";

  await prisma.invitation.createMany({
    data: [
      {
        firmId: firmA.id,
        email: validEmail,
        role: "PARALEGAL",
        title: "Litigation support",
        tokenHash: tokenHash(validToken),
        invitedById: ownerAUser.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
      {
        firmId: firmA.id,
        email: expiredEmail,
        role: "CONSULTANT",
        tokenHash: tokenHash(expiredToken),
        invitedById: ownerAUser.id,
        expiresAt: new Date(Date.now() - 86_400_000),
      },
    ],
  });

  return {
    firmA,
    firmB,
    users: {
      ownerA: ownerAUser,
      attorneyA: attorneyAUser,
      paralegalA: paralegalAUser,
      clmA: clmUserA,
      consultantA: consultantAUser,
      ownerB: ownerBUser,
    },
    sessions: {
      ownerA: sessionFor(ownerAUser, firmA, "OWNER"),
      attorneyA: sessionFor(attorneyAUser, firmA, "ATTORNEY"),
      paralegalA: sessionFor(paralegalAUser, firmA, "PARALEGAL"),
      clmA: sessionFor(clmUserA, firmA, "CLM"),
      consultantA: sessionFor(consultantAUser, firmA, "CONSULTANT"),
      ownerB: sessionFor(ownerBUser, firmB, "OWNER"),
    },
    matters: { assignedA, unassignedA, firmB: firmBMatter },
    contacts: { clientA, clientB },
    invoices: { invoiceA, invoiceB },
    intakes: { reviewA, firmB: intakeB },
    invitations: { validToken, validEmail, expiredToken, expiredEmail },
  };
}
