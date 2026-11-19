/**
 * Synthetic Haynes/Quentin demo seed.
 *
 * This seed is intentionally narrow and non-destructive: it only creates or
 * updates the named demo firm, Quentin's account, and the demo records below.
 * It never deletes firms, users, or unrelated records.
 *
 * Usage (against an isolated demo database only):
 *
 *   DEMO_SEED_CONFIRM=haynes-demo \
 *   DEMO_PASSWORD='<a unique 12+ character password>' \
 *   npm run db:seed:haynes
 *
 * Required:
 *   DEMO_SEED_CONFIRM=haynes-demo
 *   DEMO_PASSWORD=<unique password>
 *   DATABASE_URL=<demo database>
 *
 * Optional:
 *   DEMO_EMAIL (default: quentin@lexindiana.test)
 *   DEMO_FIRM_NAME (default: Haynes & Associates LLC)
 */
import { readFileSync } from "node:fs";
import { PrismaClient, type ContactType, type MatterStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDaysISO, parseIndianaDateTime, parseISODate, todayISO } from "../src/lib/dates";
import { serializeAliases } from "../src/lib/aliases";
import { calculateDeadline } from "../src/lib/deadlines";

function loadEnv() {
  try {
    for (const line of readFileSync(".env", "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // .env is optional when variables come from the environment.
  }
}

loadEnv();

const CONFIRMATION = "haynes-demo";
const DEMO_EMAIL = (process.env.DEMO_EMAIL ?? "quentin@lexindiana.test").trim().toLowerCase();
const DEMO_FIRM_NAME = process.env.DEMO_FIRM_NAME?.trim() || "Haynes & Associates LLC";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "";

if (process.env.DEMO_SEED_CONFIRM !== CONFIRMATION) {
  console.error(
    `Refusing to seed: set DEMO_SEED_CONFIRM=${CONFIRMATION} and run this only against an isolated demo database.`,
  );
  process.exit(1);
}

if (DEMO_PASSWORD.length < 12) {
  console.error("Refusing to seed: DEMO_PASSWORD must be set to at least 12 characters.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("Refusing to seed: DATABASE_URL is required.");
  process.exit(1);
}

const prisma = new PrismaClient();

type ContactInput = {
  type: ContactType;
  name: string;
  aliases?: string[];
  email?: string | null;
  phone?: string | null;
  organization?: string | null;
  address?: string | null;
  notes?: string | null;
};

type MatterInput = {
  clientId: string;
  title: string;
  causeNumber?: string | null;
  county: string;
  courtName?: string | null;
  practiceArea: string;
  status: MatterStatus;
  notes?: string | null;
};

async function main() {
  const firmMatches = await prisma.firm.findMany({
    where: { name: DEMO_FIRM_NAME },
    select: { id: true, name: true },
  });
  if (firmMatches.length > 1) {
    throw new Error(
      `More than one firm is named "${DEMO_FIRM_NAME}". Use DEMO_FIRM_NAME to select one or clean up the demo database.`,
    );
  }

  const firm =
    firmMatches[0] ??
    (await prisma.firm.create({
      data: {
        name: DEMO_FIRM_NAME,
        address: "200 W. Washington St., Suite 1800, Indianapolis, IN 46204",
        phone: "(317) 555-0108",
        email: "demo@haynes.example",
        intakeEnabled: false,
      },
      select: { id: true, name: true },
    }));

  const existingUser = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: { id: true, memberships: { select: { firmId: true } } },
  });
  if (existingUser?.memberships.some((membership) => membership.firmId !== firm.id)) {
    throw new Error(
      `The account ${DEMO_EMAIL} already belongs to another firm. Refusing to move an existing account.`,
    );
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { name: "Quentin", passwordHash },
    create: {
      email: DEMO_EMAIL,
      name: "Quentin",
      passwordHash,
      indianaAttorneyNumber: "DEMO-0001",
      defaultHourlyRate: 325,
    },
    select: { id: true, email: true, name: true },
  });

  await prisma.membership.upsert({
    where: { userId: user.id },
    update: { firmId: firm.id, role: "OWNER" },
    create: { firmId: firm.id, userId: user.id, role: "OWNER" },
  });

  const ensureContact = async (input: ContactInput) => {
    const existing = await prisma.contact.findFirst({
      where: { firmId: firm.id, name: input.name },
      select: { id: true },
    });
    if (existing) return existing;
    return prisma.contact.create({
      data: {
        firmId: firm.id,
        userId: user.id,
        type: input.type,
        name: input.name,
        aliases: serializeAliases(input.aliases),
        email: input.email ?? null,
        phone: input.phone ?? null,
        organization: input.organization ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
      },
      select: { id: true },
    });
  };

  const ensureMatter = async (input: MatterInput) => {
    const existing = await prisma.matter.findFirst({
      where: { firmId: firm.id, title: input.title },
      select: { id: true },
    });
    if (existing) return existing;
    return prisma.matter.create({
      data: {
        firmId: firm.id,
        userId: user.id,
        clientId: input.clientId,
        title: input.title,
        causeNumber: input.causeNumber ?? null,
        county: input.county,
        courtName: input.courtName ?? null,
        practiceArea: input.practiceArea,
        status: input.status,
        notes: input.notes ?? null,
        openedAt: new Date(),
      },
      select: { id: true },
    });
  };

  const nora = await ensureContact({
    type: "CLIENT",
    name: "Nora P. Whitaker",
    aliases: ["Nora Whitaker"],
    email: "nora@whitaker.example",
    phone: "(317) 555-0144",
    organization: "Whitaker Studio",
    address: "418 E. 16th St., Indianapolis, IN 46202",
    notes: "Synthetic demo client. Engagement letter is fictional.",
  });
  const arthur = await ensureContact({
    type: "CLIENT",
    name: "Arthur J. Bell",
    aliases: ["Arthur Bell"],
    email: "arthur.bell@example.com",
    phone: "(317) 555-0171",
    address: "920 N. Alabama St., Indianapolis, IN 46202",
    notes: "Synthetic demo client for the estate matter.",
  });
  const ridgeline = await ensureContact({
    type: "OPPOSING_PARTY",
    name: "Ridgeline Property Group LLC",
    aliases: ["Ridgeline Property", "RPG"],
    email: "legal@ridgeline.example",
    organization: "Ridgeline Property Group LLC",
    address: "1 Market Plaza, Suite 900, Indianapolis, IN 46204",
    notes: "Synthetic opposing party for the demo matter.",
  });
  const ellison = await ensureContact({
    type: "OPPOSING_COUNSEL",
    name: "Grant P. Ellison",
    aliases: ["G. Ellison"],
    email: "gellison@ellison-tate.example",
    phone: "(317) 555-0199",
    organization: "Ellison & Tate LLP",
    notes: "Synthetic opposing counsel for the demo matter.",
  });

  const whitakerMatter = await ensureMatter({
    clientId: nora.id,
    title: "Whitaker v. Ridgeline Property Group",
    causeNumber: "49D01-2609-CT-009876",
    county: "Marion",
    courtName: "Marion Superior Court, Civil Division 6",
    practiceArea: "Civil Litigation",
    status: "ACTIVE",
    notes: "Synthetic demo matter. Contract and property-damage dispute.",
  });
  const bellMatter = await ensureMatter({
    clientId: arthur.id,
    title: "Estate of Arthur J. Bell",
    causeNumber: "29D02-2608-ES-004321",
    county: "Hamilton",
    courtName: "Hamilton Superior Court 2",
    practiceArea: "Estate Planning",
    status: "PENDING",
    notes: "Synthetic demo matter. Inventory and accounting are pending.",
  });

  // SQLite does not support `skipDuplicates`, so filter what already exists and
  // keep the seed idempotent without relying on provider-specific behaviour.
  const linkedParties = await prisma.matterContact.findMany({
    where: { firmId: firm.id, matterId: whitakerMatter.id },
    select: { contactId: true },
  });
  const linkedContactIds = new Set(linkedParties.map((party) => party.contactId));
  const partiesToLink = [
    {
      firmId: firm.id,
      userId: user.id,
      matterId: whitakerMatter.id,
      contactId: ridgeline.id,
      role: "OPPOSING_PARTY" as const,
    },
    {
      firmId: firm.id,
      userId: user.id,
      matterId: whitakerMatter.id,
      contactId: ellison.id,
      role: "OPPOSING_COUNSEL" as const,
    },
  ].filter((party) => !linkedContactIds.has(party.contactId));
  if (partiesToLink.length > 0) {
    await prisma.matterContact.createMany({ data: partiesToLink });
  }

  const ensureTimeEntry = async (input: {
    matterId: string;
    description: string;
    hours: number;
    daysAgo: number;
  }) => {
    const existing = await prisma.timeEntry.findFirst({
      where: { firmId: firm.id, matterId: input.matterId, description: input.description },
      select: { id: true },
    });
    if (existing) return;
    const startedAt = parseISODate(addDaysISO(todayISO(), -input.daysAgo));
    startedAt.setUTCHours(14, 0, 0, 0);
    await prisma.timeEntry.create({
      data: {
        firmId: firm.id,
        userId: user.id,
        matterId: input.matterId,
        description: input.description,
        startedAt,
        endedAt: new Date(startedAt.getTime() + Math.round(input.hours * 60) * 60_000),
        durationMinutes: Math.round(input.hours * 60),
        hourlyRate: 325,
        billable: true,
      },
    });
  };

  await ensureTimeEntry({
    matterId: whitakerMatter.id,
    description: "Review synthetic contract and prepare case chronology",
    hours: 1.8,
    daysAgo: 5,
  });
  await ensureTimeEntry({
    matterId: whitakerMatter.id,
    description: "Draft demand letter for synthetic property-damage claim",
    hours: 1.2,
    daysAgo: 2,
  });
  await ensureTimeEntry({
    matterId: bellMatter.id,
    description: "Review synthetic estate inventory",
    hours: 0.9,
    daysAgo: 1,
  });

  const deadlineTitle = "Respond to amended complaint";
  const existingDeadline = await prisma.deadline.findFirst({
    where: { firmId: firm.id, title: deadlineTitle },
    select: { id: true },
  });
  if (!existingDeadline) {
    const triggerDate = addDaysISO(todayISO(), -7);
    const calculation = calculateDeadline({
      triggerDate,
      prescribedDays: 30,
      serviceMethod: "E_SERVICE",
    });
    await prisma.deadline.create({
      data: {
        firmId: firm.id,
        userId: user.id,
        matterId: whitakerMatter.id,
        title: deadlineTitle,
        ruleKey: "pleading_response",
        ruleCitation: "Ind. R. Trial P. 6(D)(1)",
        triggerEvent: "Service of amended complaint",
        triggerDate: parseISODate(triggerDate),
        serviceMethod: "E_SERVICE",
        daysAdded: calculation.mailDaysAdded,
        dueDate: parseISODate(calculation.dueDate),
        notes: "Synthetic demo deadline.",
      },
    });
  }

  const ensureTask = async (input: {
    matterId: string;
    title: string;
    description: string;
    dueDate: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    daysFromToday: number;
  }) => {
    const existing = await prisma.task.findFirst({
      where: { firmId: firm.id, matterId: input.matterId, title: input.title },
      select: { id: true },
    });
    if (existing) return;
    await prisma.task.create({
      data: {
        firmId: firm.id,
        matterId: input.matterId,
        createdById: user.id,
        assigneeId: user.id,
        title: input.title,
        description: input.description,
        dueDate: parseISODate(input.dueDate),
        priority: input.priority,
      },
    });
  };

  await ensureTask({
    matterId: whitakerMatter.id,
    title: "Prepare Nora Whitaker for deposition",
    description: "Review the chronology, mark exhibits, and schedule a prep call with the client before the deposition.",
    dueDate: addDaysISO(todayISO(), 2),
    priority: "HIGH",
    daysFromToday: 2,
  });
  await ensureTask({
    matterId: whitakerMatter.id,
    title: "Send amended discovery responses",
    description: "Finalize the supplemental responses and serve them through the Indiana e-filing system.",
    dueDate: addDaysISO(todayISO(), 5),
    priority: "URGENT",
    daysFromToday: 5,
  });
  await ensureTask({
    matterId: bellMatter.id,
    title: "Request updated estate inventory",
    description: "Ask the personal representative for the revised inventory and confirm the appraisal timeline.",
    dueDate: addDaysISO(todayISO(), 7),
    priority: "MEDIUM",
    daysFromToday: 7,
  });

  const ensureEvent = async (input: {
    matterId: string;
    title: string;
    description: string;
    type: "HEARING" | "MEETING" | "DEPOSITION" | "DEADLINE" | "OTHER";
    start: string;
    end: string;
    location: string;
  }) => {
    const existing = await prisma.calendarEvent.findFirst({
      where: { firmId: firm.id, matterId: input.matterId, title: input.title },
      select: { id: true },
    });
    if (existing) return;
    await prisma.calendarEvent.create({
      data: {
        firmId: firm.id,
        matterId: input.matterId,
        createdById: user.id,
        title: input.title,
        description: input.description,
        type: input.type,
        startsAt: parseIndianaDateTime(input.start),
        endsAt: parseIndianaDateTime(input.end),
        location: input.location,
      },
    });
  };

  await ensureEvent({
    matterId: whitakerMatter.id,
    title: "Status conference with Judge Patel",
    description: "Synthetic demo hearing. Confirm the proposed case-management schedule with opposing counsel.",
    type: "HEARING",
    start: `${addDaysISO(todayISO(), 1)}T10:00`,
    end: `${addDaysISO(todayISO(), 1)}T10:30`,
    location: "Marion Superior Court, Civil Division 6",
  });
  await ensureEvent({
    matterId: bellMatter.id,
    title: "Estate inventory call",
    description: "Synthetic demo meeting to review the revised inventory and next steps with the client.",
    type: "MEETING",
    start: `${addDaysISO(todayISO(), 3)}T14:00`,
    end: `${addDaysISO(todayISO(), 3)}T14:45`,
    location: "Haynes & Associates — Conference Room",
  });

  const counts = {
    firm: firm.name,
    email: user.email,
    contacts: await prisma.contact.count({ where: { firmId: firm.id } }),
    matters: await prisma.matter.count({ where: { firmId: firm.id } }),
    timeEntries: await prisma.timeEntry.count({ where: { firmId: firm.id } }),
    deadlines: await prisma.deadline.count({ where: { firmId: firm.id } }),
    tasks: await prisma.task.count({ where: { firmId: firm.id } }),
    calendarEvents: await prisma.calendarEvent.count({ where: { firmId: firm.id } }),
  };
  console.log("[seed:haynes] synthetic demo ready");
  console.log(JSON.stringify(counts, null, 2));
  console.log("No password was printed. Use the DEMO_PASSWORD you supplied.");
}

main()
  .catch((error) => {
    console.error("[seed:haynes] failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
