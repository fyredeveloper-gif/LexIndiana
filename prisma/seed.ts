/**
 * Seeds a demo firm with five staff roles. Safe to re-run: the demo firm's data
 * is replaced, and the other demo staff accounts are recreated.
 *
 *   npm run db:seed
 *
 * All accounts use DEMO_PASSWORD (default IndianaLaw2026!).
 */
import { readFileSync } from "node:fs";
import { PrismaClient, type ContactType, type MatterStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { serializeAliases } from "../src/lib/aliases";
import { addDaysISO, parseISODate, todayISO } from "../src/lib/dates";
import { calculateDeadline, type ServiceMethodKey } from "../src/lib/deadlines";
import { buildSampleTemplateDocx } from "../src/lib/docx";
import { generateIntakeReference, generateIntakeToken } from "../src/lib/intake";
import { putObject, templateObjectKey } from "../src/lib/storage";

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

const prisma = new PrismaClient();
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@lexindiana.test";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "IndianaLaw2026!";
const STAFF = {
  attorney: "maria@lexindiana.test",
  paralegal: "tessa@lexindiana.test",
  clm: "renee@lexindiana.test",
  consultant: "alan@lexindiana.test",
};
const STAFF_EMAILS = [DEMO_EMAIL, ...Object.values(STAFF)];
const TODAY = todayISO();
const YEAR = TODAY.slice(0, 4);

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: { id: true, memberships: { select: { firmId: true } } },
  });
  if (existing) {
    console.log("[seed] replacing existing demo firm");
    const firmId = existing.memberships[0]?.firmId;
    if (firmId) await prisma.firm.delete({ where: { id: firmId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { email: { in: STAFF_EMAILS } } });
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const intakeToken = generateIntakeToken();
  const firm = await prisma.firm.create({
    data: {
      name: "Whitfield & Associates, LLC",
      address: "111 Monument Circle, Suite 2500, Indianapolis, IN 46204",
      phone: "(317) 555-0142",
      email: "office@whitfieldlaw.example",
      intakeEnabled: true,
      intakeToken,
      intakeHeadline: "Request a consultation",
      intakeIntro:
        "Tell us briefly about your situation. Our team reviews every request, screens for conflicts, and responds within one business day.",
    },
  });
  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash,
      name: "Jordan A. Whitfield",
      indianaAttorneyNumber: "34567-12",
      defaultHourlyRate: 325,
    },
  });
  await prisma.membership.create({ data: { firmId: firm.id, userId: user.id, role: "OWNER" } });

  const makeStaff = async (data: {
    email: string;
    name: string;
    role: "ATTORNEY" | "PARALEGAL" | "CLM" | "CONSULTANT";
    title: string;
    attorneyNumber?: string;
    rate?: number;
  }) => {
    const member = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        indianaAttorneyNumber: data.attorneyNumber ?? null,
        defaultHourlyRate: data.rate ?? 0,
      },
      select: { id: true },
    });
    await prisma.membership.create({
      data: { firmId: firm.id, userId: member.id, role: data.role, title: data.title },
    });
    return member;
  };

  const attorney = await makeStaff({
    email: STAFF.attorney,
    name: "Maria L. Santos",
    role: "ATTORNEY",
    title: "Associate attorney",
    attorneyNumber: "41209-53",
    rate: 275,
  });
  const paralegal = await makeStaff({
    email: STAFF.paralegal,
    name: "Tessa J. Brooks",
    role: "PARALEGAL",
    title: "Senior paralegal",
  });
  const clm = await makeStaff({
    email: STAFF.clm,
    name: "Renee A. Coleman",
    role: "CLM",
    title: "Practice manager",
  });
  const consultant = await makeStaff({
    email: STAFF.consultant,
    name: "Alan K. Pierce",
    role: "CONSULTANT",
    title: "Outside contract reviewer",
  });

  const contact = (type: ContactType, name: string, extra: Partial<{
    aliases: string[];
    email: string;
    phone: string;
    organization: string;
    address: string;
    notes: string;
  }> = {}) =>
    prisma.contact.create({
      data: {
        firmId: firm.id,
        userId: user.id,
        type,
        name,
        aliases: serializeAliases(extra.aliases),
        email: extra.email ?? null,
        phone: extra.phone ?? null,
        organization: extra.organization ?? null,
        address: extra.address ?? null,
        notes: extra.notes ?? null,
      },
      select: { id: true },
    });

  const marcus = await contact("CLIENT", "Marcus T. Bell", {
    aliases: ["Marc Bell", "M. T. Bell"],
    email: "marcus@bellsonshvac.example",
    phone: "(317) 555-0188",
    organization: "Bell & Sons HVAC LLC",
    address: "4820 W. Washington St., Indianapolis, IN 46241",
    notes: "Referred by Angela Cross. Signed engagement letter.",
  });
  const serena = await contact("CLIENT", "Serena K. Ortiz", {
    aliases: ["Serena Ortiz", "S. Ortiz"],
    email: "serena.ortiz@example.com",
    phone: "(317) 555-0130",
    address: "1427 Conner St., Noblesville, IN 46060",
    notes: "Trustee of the Ortiz Family Trust.",
  });
  const priya = await contact("CLIENT", "Priya N. Raman", {
    aliases: ["Priya Raman"],
    email: "priya@hoosierartisan.example",
    organization: "Hoosier Artisan Foods LLC",
    phone: "(812) 555-0177",
    address: "220 E. Kirkwood Ave., Bloomington, IN 47408",
    notes: "Supplier contract review and vendor dispute.",
  });
  const rebecca = await contact("CLIENT", "Rebecca L. Vance", {
    aliases: ["Becky Vance", "R. L. Vance"],
    email: "rebecca.vance@example.com",
    phone: "(317) 555-0119",
    address: "918 N. Alabama St., Indianapolis, IN 46202",
    notes: "Criminal matter — misdemeanor battery, pretrial conference scheduled.",
  });
  const hoosierLogistics = await contact("OPPOSING_PARTY", "Hoosier Logistics Inc.", {
    aliases: ["Hoosier Logistics", "HLI", "Hoosier Logistics LLC"],
    organization: "Hoosier Logistics Inc.",
    address: "7002 W. Morris St., Indianapolis, IN 46241",
    notes: "Adverse in Bell v. Hoosier Logistics; represented by Ellison & Tate LLP.",
  });
  const stateOfIndiana = await contact("OPPOSING_PARTY", "State of Indiana", {
    aliases: ["State", "Marion County Prosecutor"],
    organization: "Marion County Prosecutor's Office",
    notes: "Adverse in State v. Vance.",
  });
  const whitmore = await contact("OPPOSING_PARTY", "Dana R. Whitmore", {
    aliases: ["Dan Whitmore", "D. Whitmore", "Whitmore Holdings LLC"],
    email: "dana@whitmoreholdings.example",
    phone: "(317) 555-0155",
    organization: "Whitmore Holdings LLC",
    notes: "Adverse in a 2024 contract dispute; possible conflict on new supplier matters.",
  });
  const ellison = await contact("OPPOSING_COUNSEL", "Grant P. Ellison", {
    aliases: ["G. Ellison"],
    email: "gellison@ellisontate.example",
    phone: "(317) 555-0199",
    organization: "Ellison & Tate LLP",
    address: "One Indiana Square, Suite 2100, Indianapolis, IN 46204",
    notes: "Counsel for Hoosier Logistics Inc.",
  });
  const angela = await contact("WITNESS", "Angela M. Cross", {
    aliases: ["Angie Cross"],
    phone: "(317) 555-0166",
    address: "1834 E. 71st St., Indianapolis, IN 46220",
    notes: "Eyewitness to the loading-dock incident; available weekday mornings.",
  });

  const matter = (
    clientId: string,
    title: string,
    extra: {
      causeNumber?: string;
      county: string;
      courtName?: string;
      practiceArea: string;
      status: MatterStatus;
      notes?: string;
      openedOffset?: number;
    },
  ) =>
    prisma.matter.create({
      data: {
        firmId: firm.id,
        userId: user.id,
        clientId,
        title,
        causeNumber: extra.causeNumber ?? null,
        county: extra.county,
        courtName: extra.courtName ?? null,
        practiceArea: extra.practiceArea,
        status: extra.status,
        notes: extra.notes ?? null,
        openedAt: parseISODate(addDaysISO(TODAY, extra.openedOffset ?? -30)),
      },
      select: { id: true },
    });

  const bell = await matter(marcus.id, "Bell v. Hoosier Logistics", {
    causeNumber: "49D01-2601-CT-001234",
    county: "Marion",
    courtName: "Marion Superior Court, Civil Division 1",
    practiceArea: "Civil Litigation",
    status: "ACTIVE",
    notes: "Commercial truck damage and lost-business claim. Conflict check completed; no hits.",
    openedOffset: -64,
  });
  const ortiz = await matter(serena.id, "Ortiz Family Trust administration", {
    causeNumber: "29D02-2512-ES-000987",
    county: "Hamilton",
    courtName: "Hamilton Superior Court 2",
    practiceArea: "Estate Planning",
    status: "PENDING",
    notes: "Awaiting the personal representative's inventory and accountings.",
    openedOffset: -112,
  });
  const artisan = await matter(priya.id, "Hoosier Artisan Foods — supplier contract review", {
    county: "Monroe",
    courtName: "Monroe Circuit Court",
    practiceArea: "Business Law",
    status: "INTAKE",
    notes: "Intake meeting scheduled. Conflict review pending on Whitmore Holdings.",
    openedOffset: -6,
  });
  const vance = await matter(rebecca.id, "State v. Vance", {
    causeNumber: "49G03-2602-CM-004521",
    county: "Marion",
    courtName: "Marion Superior Court, Criminal Division 3",
    practiceArea: "Criminal Defense",
    status: "ACTIVE",
    notes: "Pretrial conference set; discovery received from the prosecutor.",
    openedOffset: -21,
  });

  await prisma.matterContact.createMany({
    data: [
      {
          firmId: firm.id,
          userId: user.id, matterId: bell.id, contactId: hoosierLogistics.id, role: "OPPOSING_PARTY" },
      {
          firmId: firm.id,
          userId: user.id, matterId: bell.id, contactId: ellison.id, role: "OPPOSING_COUNSEL" },
      {
          firmId: firm.id,
          userId: user.id, matterId: bell.id, contactId: angela.id, role: "WITNESS" },
      {
          firmId: firm.id,
          userId: user.id, matterId: vance.id, contactId: stateOfIndiana.id, role: "OPPOSING_PARTY" },
      {
          firmId: firm.id,
          userId: user.id, matterId: artisan.id, contactId: whitmore.id, role: "OPPOSING_PARTY" },
    ],
  });

  const deadline = async (input: {
    matterId: string | null;
    title: string;
    ruleKey: string;
    citation: string;
    triggerEvent: string;
    triggerOffset: number;
    days: number;
    serviceMethod: ServiceMethodKey;
    notes?: string;
    completed?: boolean;
  }) => {
    const triggerDate = addDaysISO(TODAY, input.triggerOffset);
    const calculation = calculateDeadline({
      triggerDate,
      prescribedDays: input.days,
      serviceMethod: input.serviceMethod,
    });
    await prisma.deadline.create({
      data: {
        firmId: firm.id,
        userId: user.id,
        matterId: input.matterId,
        title: input.title,
        ruleKey: input.ruleKey,
        ruleCitation: input.citation,
        triggerEvent: input.triggerEvent,
        triggerDate: parseISODate(triggerDate),
        serviceMethod: input.serviceMethod,
        daysAdded: calculation.mailDaysAdded,
        dueDate: parseISODate(calculation.dueDate),
        completed: input.completed ?? false,
        notes: input.notes ?? null,
      },
    });
    return calculation;
  };

  const discoveryDeadline = await deadline({
    matterId: bell.id,
    title: "Response to Hoosier Logistics' written discovery",
    ruleKey: "discovery_response",
    citation: "Ind. R. Trial P. 33, 34, 36",
    triggerEvent: "Service of interrogatories and requests for production (U.S. mail)",
    triggerOffset: -27,
    days: 30,
    serviceMethod: "MAIL",
    notes: "Certificate of service shows mailing on the trigger date.",
  });

  await deadline({
    matterId: bell.id,
    title: "Reply in support of motion to compel",
    ruleKey: "motion_reply",
    citation: "Ind. R. Trial P. 6(D)(2)",
    triggerEvent: "Service of response to motion to compel",
    triggerOffset: -2,
    days: 14,
    serviceMethod: "E_SERVICE",
  });

  await deadline({
    matterId: vance.id,
    title: "Jury demand",
    ruleKey: "jury_demand",
    citation: "Ind. R. Trial P. 38(B)",
    triggerEvent: "Service of the last pleading",
    triggerOffset: -4,
    days: 10,
    serviceMethod: "E_SERVICE",
    notes: "Confirm whether the client wants a jury trial.",
  });

  await deadline({
    matterId: null,
    title: "Motion to correct error — Artisan matter",
    ruleKey: "motion_to_correct_error",
    citation: "Ind. R. Trial P. 59(C)",
    triggerEvent: "Entry of final judgment",
    triggerOffset: -9,
    days: 30,
    serviceMethod: "E_SERVICE",
  });

  await deadline({
    matterId: bell.id,
    title: "Answer to amended complaint",
    ruleKey: "pleading_response",
    citation: "Ind. R. Trial P. 6(D)(1)",
    triggerEvent: "Service of amended complaint",
    triggerOffset: -45,
    days: 20,
    serviceMethod: "E_SERVICE",
    completed: true,
  });

  const timeEntry = async (input: {
    matterId: string;
    description: string;
    daysAgo: number;
    hours: number;
    rate?: number;
    billable?: boolean;
  }) => {
    const startedAt = parseISODate(addDaysISO(TODAY, -input.daysAgo));
    startedAt.setUTCHours(14, 0, 0, 0);
    return prisma.timeEntry.create({
      data: {
        firmId: firm.id,
        userId: user.id,
        matterId: input.matterId,
        description: input.description,
        startedAt,
        endedAt: new Date(startedAt.getTime() + Math.round(input.hours * 60) * 60_000),
        durationMinutes: Math.round(input.hours * 60),
        hourlyRate: input.rate ?? 325,
        billable: input.billable ?? true,
      },
      select: { id: true },
    });
  };

  const billedOne = await timeEntry({
    matterId: bell.id,
    description: "Draft responses to interrogatories; confer with client regarding damages",
    daysAgo: 18,
    hours: 2.4,
  });
  const billedTwo = await timeEntry({
    matterId: bell.id,
    description: "Review plaintiff's production and prepare privilege log",
    daysAgo: 15,
    hours: 1.6,
  });
  await timeEntry({
    matterId: bell.id,
    description: "Telephone conference with opposing counsel re: discovery schedule",
    daysAgo: 4,
    hours: 0.5,
  });
  await timeEntry({
    matterId: bell.id,
    description: "Research Indiana summary judgment standard",
    daysAgo: 2,
    hours: 1.2,
  });
  await timeEntry({
    matterId: vance.id,
    description: "Review discovery and prepare witness interview notes",
    daysAgo: 6,
    hours: 2.1,
    rate: 275,
  });
  await timeEntry({
    matterId: vance.id,
    description: "Client intake and bond hearing preparation",
    daysAgo: 20,
    hours: 3.0,
    rate: 275,
  });
  await timeEntry({
    matterId: ortiz.id,
    description: "Review trust inventory; correspondence with personal representative",
    daysAgo: 9,
    hours: 1.3,
    billable: false,
  });

  const issueDate = addDaysISO(TODAY, -12);
  const invoiceItems = [
    {
      timeEntryId: billedOne.id,
      description: "Draft responses to interrogatories; confer with client regarding damages",
      workDate: parseISODate(addDaysISO(TODAY, -18)),
      hours: 2.4,
      rate: 325,
      amount: 780,
    },
    {
      timeEntryId: billedTwo.id,
      description: "Review plaintiff's production and prepare privilege log",
      workDate: parseISODate(addDaysISO(TODAY, -15)),
      hours: 1.6,
      rate: 325,
      amount: 520,
    },
  ];

  const invoice = await prisma.invoice.create({
    data: {
      firmId: firm.id,
      userId: user.id,
      matterId: bell.id,
      number: `INV-${YEAR}-0001`,
      status: "SENT",
      issueDate: parseISODate(issueDate),
      dueDate: parseISODate(addDaysISO(issueDate, 30)),
      notes: "Payment due within 30 days. Please reference the invoice number.",
      subtotal: 1300,
      total: 1300,
      items: { create: invoiceItems },
    },
    select: { id: true },
  });

  await prisma.timeEntry.updateMany({
    where: { id: { in: [billedOne.id, billedTwo.id] }, userId: user.id },
    data: { invoiceId: invoice.id },
  });

  // --- Public intake submissions ----------------------------------------
  const clearReference = generateIntakeReference();
  const elena = await prisma.contact.create({
    data: {
      firmId: firm.id,
      userId: user.id,
      type: "CLIENT",
      name: "Elena M. Vasquez",
      email: "elena.vasquez@example.com",
      phone: "(317) 555-0174",
      address: "2049 N. Delaware St., Indianapolis, IN 46202",
      notes: `Created from public intake ${clearReference}.`,
    },
    select: { id: true },
  });
  const elenaMatter = await prisma.matter.create({
    data: {
      firmId: firm.id,
      userId: user.id,
      clientId: elena.id,
      title: "Elena M. Vasquez — Estate Planning",
      county: "Marion",
      courtName: null,
      practiceArea: "Estate Planning",
      status: "INTAKE",
      notes: [
        `Public intake ${clearReference} received today.`,
        "Email: elena.vasquez@example.com | Phone: (317) 555-0174",
        "Summary: Wants to update a will and name a guardian for two minor children.",
        "Conflict screening clear (10 contacts, 5 matters scanned).",
      ].join("\n"),
    },
    select: { id: true },
  });
  await prisma.intakeSubmission.create({
    data: {
      firmId: firm.id,
      userId: user.id,
      reference: clearReference,
      name: "Elena M. Vasquez",
      email: "elena.vasquez@example.com",
      phone: "(317) 555-0174",
      organization: null,
      county: "Marion",
      practiceArea: "Estate Planning",
      summary:
        "I need to update my will and name a guardian for my two minor children. I own a home in Marion County and have a small retirement account.",
      opposingParties: null,
      referralSource: "Referral — Angela Cross",
      conflictStatus: "CLEAR",
      conflictMatches: {
        status: "CLEAR",
        checkedAt: new Date().toISOString(),
        terms: ["elena m. vasquez", "elena.vasquez@example.com"],
        scannedContacts: 10,
        scannedMatters: 5,
        matches: [],
        matterMatches: [],
      },
      conflictCheckedAt: new Date(),
      status: "NEW",
      assignedToId: paralegal.id,
      contactId: elena.id,
      matterId: elenaMatter.id,
    },
  });

  const reviewReference = generateIntakeReference();
  const whitmoreMatter = await prisma.matter.create({
    data: {
      firmId: firm.id,
      userId: user.id,
      clientId: whitmore.id,
      title: "Whitmore Holdings LLC v. Hoosier Artisan Foods LLC",
      county: "Marion",
      courtName: null,
      practiceArea: "Business Law",
      status: "INTAKE",
      notes: [
        `Public intake ${reviewReference} received today.`,
        "Email: dana@whitmoreholdings.example | Phone: (317) 555-0155",
        "Summary: Supplier agreement dispute over a rejected shipment and unpaid invoices.",
        "Conflict screening flagged possible matches — review before contacting.",
      ].join("\n"),
    },
    select: { id: true },
  });
  await prisma.intakeSubmission.create({
    data: {
      firmId: firm.id,
      userId: user.id,
      reference: reviewReference,
      name: "Whitmore Holdings LLC",
      email: "dana@whitmoreholdings.example",
      phone: "(317) 555-0155",
      organization: "Whitmore Holdings LLC",
      county: "Marion",
      practiceArea: "Business Law",
      summary:
        "We have a supplier dispute over a rejected shipment and unpaid invoices, and we are considering filing suit in Marion County.",
      opposingParties: "Hoosier Artisan Foods LLC",
      referralSource: "Website",
      conflictStatus: "REVIEW",
      conflictMatches: {
        status: "REVIEW",
        checkedAt: new Date().toISOString(),
        terms: [
          "whitmore holdings llc",
          "dana@whitmoreholdings.example",
          "hoosier artisan foods llc",
        ],
        scannedContacts: 10,
        scannedMatters: 5,
        matches: [
          {
            contactId: priya.id,
            name: "Priya N. Raman",
            type: "CLIENT",
            matchedFields: ["Organization"],
            matchedTerms: ["hoosier artisan foods llc"],
            matters: [
              {
                id: artisan.id,
                title: "Hoosier Artisan Foods — supplier contract review",
                status: "INTAKE",
                role: "Client",
              },
            ],
          },
        ],
        matterMatches: [],
      },
      conflictCheckedAt: new Date(),
      status: "NEW",
      assignedToId: attorney.id,
      contactId: whitmore.id,
      matterId: whitmoreMatter.id,
    },
  });

  const templateBuffer = buildSampleTemplateDocx();
  const fileName = "entry-of-appearance-sample.docx";
  const key = templateObjectKey(firm.id, fileName);
  const size = await putObject(key, templateBuffer);
  await prisma.documentTemplate.create({
    data: {
      firmId: firm.id,
      userId: user.id,
      name: "Entry of Appearance (sample)",
      description:
        "Indiana pleading template with a firm header, caption, cause number, and signature block. Uses {{placeholder}} tags.",
      fileName,
      storageKey: key,
      size,
    },
  });

  // The consultant may see one matter only; everyone else is firm-wide.
  await prisma.matterAccess.create({
    data: { matterId: bell.id, userId: consultant.id, grantedById: user.id },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        firmId: firm.id,
        actorId: user.id,
        action: "member.joined",
        entityType: "membership",
        metadata: { email: STAFF.attorney, role: "ATTORNEY" },
      },
      {
        firmId: firm.id,
        actorId: user.id,
        action: "member.joined",
        entityType: "membership",
        metadata: { email: STAFF.paralegal, role: "PARALEGAL" },
      },
      {
        firmId: firm.id,
        actorId: user.id,
        action: "member.joined",
        entityType: "membership",
        metadata: { email: STAFF.clm, role: "CLM" },
      },
    ],
  });

  await prisma.firm.update({
    where: { id: firm.id },
    data: { invoiceSeq: await prisma.invoice.count({ where: { firmId: firm.id } }) },
  });

  console.log("\n[seed] demo firm ready");
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log(`  owner:      ${DEMO_EMAIL}`);
  console.log(`  attorney:   ${STAFF.attorney}`);
  console.log(`  paralegal:  ${STAFF.paralegal}`);
  console.log(`  clm:        ${STAFF.clm}`);
  console.log(`  consultant: ${STAFF.consultant} (one assigned matter)`);
  console.log(`  matters:  6 · contacts: 10 · invoice: ${invoice ? "yes" : "no"}`);
  console.log(`  intake:   ${process.env.APP_URL ?? "http://localhost:3000"}/request/${intakeToken}`);
  if (discoveryDeadline.rolled) {
    console.log(
      `  note:     the mailed discovery deadline rolled from ${discoveryDeadline.unadjustedDueDate} to ${discoveryDeadline.dueDate}`,
    );
  }
}

main()
  .catch((error) => {
    console.error("[seed] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
