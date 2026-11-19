import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addDaysISO, isoDate, parseISODate, todayISO } from "@/lib/dates";
import { CONTACT_TYPE_LABELS, MATTER_STATUS_LABELS, titleCase } from "@/lib/utils";
import { can } from "@/lib/permissions";
import {
  matchContact,
  normalizeTerm,
  type ConflictContactMatch,
  type ConflictMatterMatch,
  type ConflictScreen,
  type ConflictSnapshot,
} from "@/lib/conflicts";

/**
 * Every function takes the authenticated session user and scopes by their
 * membership's firmId. `userId` on records is attribution only. Callers must
 * never pass a firm or user id from a request body.
 *
 * Consultants additionally see only matters with an explicit MatterAccess row.
 */

export type MatterSummary = {
  id: string;
  title: string;
  causeNumber: string | null;
  county: string;
  courtName: string | null;
  practiceArea: string;
  status: string;
  openedAt: string;
  clientId: string;
  clientName: string;
};

export type DeadlineSummary = {
  id: string;
  title: string;
  ruleKey: string | null;
  ruleCitation: string | null;
  triggerEvent: string;
  triggerDate: string;
  serviceMethod: string;
  daysAdded: number;
  dueDate: string;
  completed: boolean;
  notes: string | null;
  matterId: string | null;
  matterTitle: string | null;
};

export type TimeEntrySummary = {
  id: string;
  userId: string;
  matterId: string;
  matterTitle: string;
  description: string;
  workDate: string;
  minutes: number;
  hours: number;
  rate: number;
  amount: number;
  billable: boolean;
  invoiceId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  staffName: string | null;
};

export type InvoiceSummary = {
  id: string;
  number: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  total: number;
  matterId: string;
  matterTitle: string;
  clientName: string;
};

export type DocumentSummary = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  kind: string;
  createdAt: string;
  templateName: string | null;
};

export type TemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  fileName: string;
  size: number;
  createdAt: string;
  defaultMatterId: string | null;
};

export type ContactSummary = {
  id: string;
  type: string;
  name: string;
  aliases: string[];
  email: string | null;
  phone: string | null;
  organization: string | null;
  address: string | null;
  notes: string | null;
  matterCount: number;
  createdAt: string;
};

export type MatterOption = { id: string; title: string; clientName: string };

function toNumber(value: { toString(): string } | number): number {
  return typeof value === "number" ? value : Number(value.toString());
}

/** Matter visibility: the whole firm, except consultants who need explicit access. */
function matterWhere(user: SessionUser): Prisma.MatterWhereInput {
  return user.role === "CONSULTANT"
    ? { firmId: user.firmId, access: { some: { userId: user.id } } }
    : { firmId: user.firmId };
}

export async function getMatters(user: SessionUser): Promise<MatterSummary[]> {
  const matters = await prisma.matter.findMany({
    where: matterWhere(user),
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: { client: { select: { name: true } } },
  });
  return matters.map((matter) => ({
    id: matter.id,
    title: matter.title,
    causeNumber: matter.causeNumber,
    county: matter.county,
    courtName: matter.courtName,
    practiceArea: matter.practiceArea,
    status: matter.status,
    openedAt: isoDate(matter.openedAt),
    clientId: matter.clientId,
    clientName: matter.client.name,
  }));
}

export async function getMatterOptions(user: SessionUser): Promise<MatterOption[]> {
  const matters = await prisma.matter.findMany({
    where: { ...matterWhere(user), status: { not: "CLOSED" } },
    orderBy: { title: "asc" },
    select: { id: true, title: true, client: { select: { name: true } } },
  });
  return matters.map((matter) => ({ id: matter.id, title: matter.title, clientName: matter.client.name }));
}

export async function getMatterDetail(user: SessionUser, matterId: string) {
  const matter = await prisma.matter.findFirst({
    where: { id: matterId, ...matterWhere(user) },
    include: {
      client: true,
      parties: { include: { contact: true }, orderBy: { createdAt: "asc" } },
      timeEntries: {
        orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
        include: { user: { select: { name: true } } },
      },
      invoices: { orderBy: { issueDate: "desc" } },
      deadlines: { orderBy: { dueDate: "asc" } },
      documents: { include: { template: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!matter) return null;

  const showAllTime = can(user.role, "time:view_all");
  const showOwnTime = can(user.role, "time:own");
  const showInvoices = can(user.role, "invoice:read");

  const visibleTime = showAllTime
    ? matter.timeEntries
    : showOwnTime
      ? matter.timeEntries.filter((entry) => entry.userId === user.id)
      : [];

  const unbilled = visibleTime.filter(
    (entry) => entry.billable && !entry.invoiceId && entry.durationMinutes > 0,
  );

  return {
    id: matter.id,
    title: matter.title,
    causeNumber: matter.causeNumber,
    county: matter.county,
    courtName: matter.courtName,
    practiceArea: matter.practiceArea,
    status: matter.status,
    notes: matter.notes,
    openedAt: isoDate(matter.openedAt),
    updatedAt: matter.updatedAt.toISOString(),
    client: {
      id: matter.client.id,
      name: matter.client.name,
      email: matter.client.email,
      phone: matter.client.phone,
      organization: matter.client.organization,
      address: matter.client.address,
    },
    parties: matter.parties.map((party) => ({
      id: party.id,
      role: party.role,
      roleLabel: CONTACT_TYPE_LABELS[party.role] ?? titleCase(party.role),
      contact: {
        id: party.contact.id,
        name: party.contact.name,
        type: party.contact.type,
        email: party.contact.email,
        phone: party.contact.phone,
        organization: party.contact.organization,
      },
    })),
    deadlines: matter.deadlines.map(mapDeadline(matter.title)),
    timeEntries: visibleTime.map((entry) => ({
      ...mapTimeEntry(entry, matter.title),
      staffName: entry.user?.name ?? null,
    })),
    invoices: showInvoices
      ? matter.invoices.map((invoice) => ({
          id: invoice.id,
          number: invoice.number,
          status: invoice.status,
          issueDate: isoDate(invoice.issueDate),
          dueDate: invoice.dueDate ? isoDate(invoice.dueDate) : null,
          total: toNumber(invoice.total),
          matterId: matter.id,
          matterTitle: matter.title,
          clientName: matter.client.name,
        }))
      : [],
    documents: matter.documents.map((document) => ({
      id: document.id,
      fileName: document.fileName,
      mimeType: document.mimeType,
      size: document.size,
      kind: document.kind,
      createdAt: document.createdAt.toISOString(),
      templateName: document.template?.name ?? null,
    })),
    unbilled: showInvoices
      ? {
          minutes: unbilled.reduce((sum, entry) => sum + entry.durationMinutes, 0),
          value: unbilled.reduce(
            (sum, entry) => sum + (entry.durationMinutes / 60) * toNumber(entry.hourlyRate),
            0,
          ),
          count: unbilled.length,
        }
      : { minutes: 0, value: 0, count: 0 },
  };
}

function mapDeadline(matterTitle?: string | null) {
  return (deadline: {
    id: string;
    title: string;
    ruleKey: string | null;
    ruleCitation: string | null;
    triggerEvent: string;
    triggerDate: Date;
    serviceMethod: string;
    daysAdded: number;
    dueDate: Date;
    completed: boolean;
    notes: string | null;
    matterId: string | null;
    matter?: { title: string } | null;
  }): DeadlineSummary => ({
    id: deadline.id,
    title: deadline.title,
    ruleKey: deadline.ruleKey,
    ruleCitation: deadline.ruleCitation,
    triggerEvent: deadline.triggerEvent,
    triggerDate: isoDate(deadline.triggerDate),
    serviceMethod: deadline.serviceMethod,
    daysAdded: deadline.daysAdded,
    dueDate: isoDate(deadline.dueDate),
    completed: deadline.completed,
    notes: deadline.notes,
    matterId: deadline.matterId,
    matterTitle: deadline.matter?.title ?? matterTitle ?? null,
  });
}

function mapTimeEntry(
  entry: {
    id: string;
    userId: string;
    matterId: string;
    description: string;
    startedAt: Date | null;
    endedAt: Date | null;
    durationMinutes: number;
    hourlyRate: { toString(): string } | number;
    billable: boolean;
    invoiceId: string | null;
    createdAt: Date;
  },
  matterTitle: string,
): TimeEntrySummary {
  const rate = toNumber(entry.hourlyRate);
  return {
    id: entry.id,
    userId: entry.userId,
    matterId: entry.matterId,
    matterTitle,
    description: entry.description,
    workDate: isoDate(entry.startedAt ?? entry.createdAt),
    minutes: entry.durationMinutes,
    hours: Math.round((entry.durationMinutes / 60) * 100) / 100,
    rate,
    amount: Math.round((entry.durationMinutes / 60) * rate * 100) / 100,
    billable: entry.billable,
    invoiceId: entry.invoiceId,
    startedAt: entry.startedAt?.toISOString() ?? null,
    endedAt: entry.endedAt?.toISOString() ?? null,
    staffName: null,
  };
}

export async function getDeadlines(
  user: SessionUser,
  options: { includeCompleted?: boolean; matterId?: string; limit?: number } = {},
): Promise<DeadlineSummary[]> {
  if (!can(user.role, "deadline:read")) return [];
  const deadlines = await prisma.deadline.findMany({
    where: {
      firmId: user.firmId,
      ...(user.role === "CONSULTANT"
        ? { matter: { access: { some: { userId: user.id } } } }
        : {}),
      ...(options.includeCompleted ? {} : { completed: false }),
      ...(options.matterId ? { matterId: options.matterId } : {}),
    },
    orderBy: { dueDate: "asc" },
    take: options.limit ?? 200,
    include: { matter: { select: { title: true } } },
  });
  return deadlines.map(mapDeadline());
}

export async function getTimeEntries(user: SessionUser, limit = 200): Promise<TimeEntrySummary[]> {
  if (!can(user.role, "time:own")) return [];
  const entries = await prisma.timeEntry.findMany({
    where: {
      firmId: user.firmId,
      endedAt: { not: null },
      ...(can(user.role, "time:view_all") ? {} : { userId: user.id }),
    },
    orderBy: { startedAt: "desc" },
    take: limit,
    include: { matter: { select: { title: true } }, user: { select: { name: true } } },
  });
  return entries.map((entry) => ({
    ...mapTimeEntry(entry, entry.matter.title),
    staffName: entry.user.name,
  }));
}

export async function getActiveTimer(user: SessionUser) {
  if (!can(user.role, "time:own")) return null;
  const entry = await prisma.timeEntry.findFirst({
    where: { firmId: user.firmId, userId: user.id, startedAt: { not: null }, endedAt: null },
    orderBy: { startedAt: "desc" },
    include: { matter: { select: { id: true, title: true } } },
  });
  if (!entry) return null;
  return {
    id: entry.id,
    matterId: entry.matterId,
    matterTitle: entry.matter.title,
    description: entry.description,
    startedAt: entry.startedAt?.toISOString() ?? null,
    billable: entry.billable,
  };
}

export async function getInvoices(user: SessionUser): Promise<InvoiceSummary[]> {
  if (!can(user.role, "invoice:read")) return [];
  const invoices = await prisma.invoice.findMany({
    where: { firmId: user.firmId },
    orderBy: { issueDate: "desc" },
    include: { matter: { include: { client: { select: { name: true } } } } },
  });
  return invoices.map((invoice) => ({
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    issueDate: isoDate(invoice.issueDate),
    dueDate: invoice.dueDate ? isoDate(invoice.dueDate) : null,
    total: toNumber(invoice.total),
    matterId: invoice.matterId,
    matterTitle: invoice.matter.title,
    clientName: invoice.matter.client.name,
  }));
}

export async function getInvoiceDetail(user: SessionUser, invoiceId: string) {
  if (!can(user.role, "invoice:read")) return null;
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, firmId: user.firmId },
    include: {
      items: { orderBy: [{ workDate: "asc" }, { id: "asc" }] },
      matter: { include: { client: true } },
    },
  });
  if (!invoice) return null;
  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    issueDate: isoDate(invoice.issueDate),
    dueDate: invoice.dueDate ? isoDate(invoice.dueDate) : null,
    notes: invoice.notes,
    subtotal: toNumber(invoice.subtotal),
    total: toNumber(invoice.total),
    matter: {
      id: invoice.matter.id,
      title: invoice.matter.title,
      causeNumber: invoice.matter.causeNumber,
      county: invoice.matter.county,
      courtName: invoice.matter.courtName,
      client: {
        name: invoice.matter.client.name,
        organization: invoice.matter.client.organization,
        email: invoice.matter.client.email,
        address: invoice.matter.client.address,
      },
    },
    items: invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      workDate: isoDate(item.workDate),
      hours: toNumber(item.hours),
      rate: toNumber(item.rate),
      amount: toNumber(item.amount),
    })),
  };
}

export async function getUnbilledByMatter(user: SessionUser) {
  if (!can(user.role, "invoice:read")) return [];
  const entries = await prisma.timeEntry.findMany({
    where: { firmId: user.firmId, invoiceId: null, billable: true, durationMinutes: { gt: 0 } },
    orderBy: { startedAt: "asc" },
    include: {
      matter: { select: { id: true, title: true, client: { select: { name: true } } } },
      user: { select: { name: true } },
    },
  });

  const grouped = new Map<
    string,
    { matterId: string; matterTitle: string; clientName: string; minutes: number; value: number; entries: TimeEntrySummary[] }
  >();
  for (const entry of entries) {
    const existing = grouped.get(entry.matterId) ?? {
      matterId: entry.matterId,
      matterTitle: entry.matter.title,
      clientName: entry.matter.client.name,
      minutes: 0,
      value: 0,
      entries: [],
    };
    existing.minutes += entry.durationMinutes;
    existing.value += (entry.durationMinutes / 60) * toNumber(entry.hourlyRate);
    existing.entries.push({
      ...mapTimeEntry(entry, entry.matter.title),
      staffName: entry.user.name,
    });
    grouped.set(entry.matterId, existing);
  }
  return Array.from(grouped.values()).sort((a, b) => b.value - a.value);
}

export async function getContacts(user: SessionUser): Promise<ContactSummary[]> {
  if (!can(user.role, "contact:read")) return [];
  const contacts = await prisma.contact.findMany({
    where: { firmId: user.firmId },
    orderBy: [{ name: "asc" }],
    include: { _count: { select: { matterLinks: true, clientOfMatters: true } } },
  });
  return contacts.map((contact) => ({
    id: contact.id,
    type: contact.type,
    name: contact.name,
    aliases: contact.aliases,
    email: contact.email,
    phone: contact.phone,
    organization: contact.organization,
    address: contact.address,
    notes: contact.notes,
    matterCount: contact._count.matterLinks + contact._count.clientOfMatters,
    createdAt: contact.createdAt.toISOString(),
  }));
}

export async function getTemplates(user: SessionUser): Promise<TemplateSummary[]> {
  if (!can(user.role, "template:read")) return [];
  const templates = await prisma.documentTemplate.findMany({
    where: { firmId: user.firmId },
    orderBy: { createdAt: "desc" },
  });
  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    fileName: template.fileName,
    size: template.size,
    createdAt: template.createdAt.toISOString(),
    defaultMatterId: template.defaultMatterId,
  }));
}

export async function getProfile(user: SessionUser) {
  const userRecord = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      indianaAttorneyNumber: true,
      defaultHourlyRate: true,
      twoFactorEnabled: true,
      createdAt: true,
      memberships: {
        select: {
          role: true,
          title: true,
          firm: { select: { id: true, name: true, address: true, phone: true, email: true } },
        },
      },
    },
  });
  if (!userRecord) return null;
  const membership = userRecord.memberships[0];
  return {
    id: userRecord.id,
    name: userRecord.name,
    email: userRecord.email,
    indianaAttorneyNumber: userRecord.indianaAttorneyNumber,
    defaultHourlyRate: toNumber(userRecord.defaultHourlyRate),
    twoFactorEnabled: userRecord.twoFactorEnabled,
    createdAt: userRecord.createdAt.toISOString(),
    role: membership?.role ?? user.role,
    firmName: membership?.firm.name ?? user.firmName,
    firmAddress: membership?.firm.address ?? null,
    firmPhone: membership?.firm.phone ?? null,
    firmEmail: membership?.firm.email ?? null,
  };
}

export async function getDashboard(user: SessionUser) {
  const today = todayISO();
  const horizon = addDaysISO(today, 30);
  const showFinancials = can(user.role, "invoice:read");
  const consultantScope = user.role === "CONSULTANT" ? { access: { some: { userId: user.id } } } : {};

  const [matters, deadlines, unbilledEntries, activeTimer, invoices] = await Promise.all([
    prisma.matter.findMany({
      where: matterWhere(user),
      orderBy: { updatedAt: "desc" },
      include: { client: { select: { name: true } } },
    }),
    prisma.deadline.findMany({
      where: {
        firmId: user.firmId,
        completed: false,
        dueDate: { gte: parseISODate(today), lte: parseISODate(horizon) },
        ...(user.role === "CONSULTANT" ? { matter: { access: { some: { userId: user.id } } } } : {}),
      },
      orderBy: { dueDate: "asc" },
      take: 7,
      include: { matter: { select: { title: true } } },
    }),
    showFinancials
      ? prisma.timeEntry.findMany({
          where: { firmId: user.firmId, invoiceId: null, billable: true, durationMinutes: { gt: 0 } },
          select: { durationMinutes: true, hourlyRate: true, matterId: true },
        })
      : Promise.resolve([]),
    getActiveTimer(user),
    showFinancials
      ? prisma.invoice.findMany({ where: { firmId: user.firmId }, select: { total: true, status: true } })
      : Promise.resolve([]),
  ]);

  const overdue = await prisma.deadline.count({
    where: {
      firmId: user.firmId,
      completed: false,
      dueDate: { lt: parseISODate(today) },
      ...(user.role === "CONSULTANT" ? { matter: { access: { some: { userId: user.id } } } } : {}),
    },
  });

  const unbilledMinutes = unbilledEntries.reduce((sum, entry) => sum + entry.durationMinutes, 0);
  const unbilledValue = unbilledEntries.reduce(
    (sum, entry) => sum + (entry.durationMinutes / 60) * toNumber(entry.hourlyRate),
    0,
  );
  const outstanding = invoices
    .filter((invoice) => invoice.status !== "PAID")
    .reduce((sum, invoice) => sum + toNumber(invoice.total), 0);
  const collected = invoices
    .filter((invoice) => invoice.status === "PAID")
    .reduce((sum, invoice) => sum + toNumber(invoice.total), 0);

  return {
    today,
    stats: {
      activeMatters: matters.filter((matter) => matter.status === "ACTIVE").length,
      intakeMatters: matters.filter((matter) => matter.status === "INTAKE").length,
      upcomingDeadlines: deadlines.length + overdue,
      dueThisMonth: deadlines.length,
      overdue,
      unbilledMinutes,
      unbilledValue,
      outstanding,
      collected,
    },
    upcomingDeadlines: deadlines.map(mapDeadline()),
    recentMatters: matters.slice(0, 6).map((matter) => ({
      id: matter.id,
      title: matter.title,
      clientName: matter.client.name,
      status: matter.status,
      statusLabel: MATTER_STATUS_LABELS[matter.status] ?? matter.status,
      county: matter.county,
      causeNumber: matter.causeNumber,
      updatedAt: matter.updatedAt.toISOString(),
    })),
    activeTimer,
    unbilledByMatter: unbilledEntries.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.matterId] = (acc[entry.matterId] ?? 0) + entry.durationMinutes;
      return acc;
    }, {}),
    showFinancials,
    consultantScope,
  };
}

export type ConflictMatch = {
  contact: ContactSummary;
  matchedFields: string[];
  matters: Array<{ id: string; title: string; status: string; role: string }>;
};

/** Searches every contact name, alias, note and matter text in one firm. */
export async function runConflictSearch(user: SessionUser, rawQuery: string) {
  if (!can(user.role, "conflict:read")) {
    return { query: rawQuery, contacts: [] as ConflictMatch[], matters: [], contactsScanned: 0, mattersScanned: 0 };
  }
  const query = rawQuery.trim();
  if (query.length < 2) {
    return { query, contacts: [] as ConflictMatch[], matters: [], contactsScanned: 0, mattersScanned: 0 };
  }
  const needle = query.toLowerCase();

  const [contacts, matters] = await Promise.all([
    prisma.contact.findMany({
      where: { firmId: user.firmId },
      include: {
        clientOfMatters: { select: { id: true, title: true, status: true } },
        matterLinks: { include: { matter: { select: { id: true, title: true, status: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.matter.findMany({
      where: { firmId: user.firmId },
      select: { id: true, title: true, causeNumber: true, notes: true, status: true, client: { select: { name: true } } },
    }),
  ]);

  const matches: ConflictMatch[] = [];
  for (const contact of contacts) {
    const matchedFields: string[] = [];
    if (contact.name.toLowerCase().includes(needle)) matchedFields.push("Name");
    contact.aliases.forEach((alias, index) => {
      if (alias.toLowerCase().includes(needle)) matchedFields.push(`Alias ${index + 1}`);
    });
    if (contact.notes?.toLowerCase().includes(needle)) matchedFields.push("Notes");
    if (contact.email?.toLowerCase().includes(needle)) matchedFields.push("Email");
    if (contact.organization?.toLowerCase().includes(needle)) matchedFields.push("Organization");
    if (matchedFields.length === 0) continue;

    const related = [
      ...contact.clientOfMatters.map((matter) => ({
        id: matter.id,
        title: matter.title,
        status: matter.status,
        role: "Client",
      })),
      ...contact.matterLinks.map((link) => ({
        id: link.matter.id,
        title: link.matter.title,
        status: link.matter.status,
        role: CONTACT_TYPE_LABELS[link.role] ?? titleCase(link.role),
      })),
    ];
    const unique = Array.from(new Map(related.map((matter) => [matter.id, matter])).values());

    matches.push({
      contact: {
        id: contact.id,
        type: contact.type,
        name: contact.name,
        aliases: contact.aliases,
        email: contact.email,
        phone: contact.phone,
        organization: contact.organization,
        address: contact.address,
        notes: contact.notes,
        matterCount: related.length,
        createdAt: contact.createdAt.toISOString(),
      },
      matchedFields,
      matters: unique,
    });
  }

  const matterMatches = matters
    .filter(
      (matter) =>
        matter.title.toLowerCase().includes(needle) ||
        (matter.causeNumber ?? "").toLowerCase().includes(needle) ||
        (matter.notes ?? "").toLowerCase().includes(needle) ||
        matter.client.name.toLowerCase().includes(needle),
    )
    .map((matter) => ({
      id: matter.id,
      title: matter.title,
      causeNumber: matter.causeNumber,
      status: matter.status,
      clientName: matter.client.name,
    }));

  return {
    query,
    contacts: matches,
    matters: matterMatches,
    contactsScanned: contacts.length,
    mattersScanned: matters.length,
  };
}

// ---------------------------------------------------------------------------
// Public intake
// ---------------------------------------------------------------------------

export type IntakeSummary = {
  id: string;
  reference: string;
  name: string;
  email: string;
  organization: string | null;
  county: string;
  practiceArea: string;
  status: string;
  conflictStatus: string;
  createdAt: string;
  matterId: string | null;
  matterTitle: string | null;
  matterStatus: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
};

/**
 * Screens normalized terms against a firm's contacts and matters.
 * Used by public intake before a matter is opened. Contact ids and the matter
 * client id can be excluded so a returning client is not reported against
 * their own record.
 */
export async function screenConflicts(
  firmId: string,
  rawTerms: string[],
  options: { excludeContactIds?: string[]; excludeClientId?: string } = {},
): Promise<ConflictScreen> {
  const terms = Array.from(
    new Set(rawTerms.map((term) => normalizeTerm(term)).filter((term): term is string => Boolean(term))),
  );
  const excludeContactIds = options.excludeContactIds ?? [];

  const [contacts, matters] = await Promise.all([
    prisma.contact.findMany({
      where: { firmId },
      include: {
        clientOfMatters: { select: { id: true, title: true, status: true } },
        matterLinks: { include: { matter: { select: { id: true, title: true, status: true } } } },
      },
    }),
    prisma.matter.findMany({
      where: {
        firmId,
        ...(options.excludeClientId ? { clientId: { not: options.excludeClientId } } : {}),
      },
      select: {
        id: true,
        title: true,
        causeNumber: true,
        notes: true,
        status: true,
        client: { select: { name: true } },
      },
    }),
  ]);

  const matches: ConflictContactMatch[] = [];
  if (terms.length > 0) {
    for (const contact of contacts) {
      const result = matchContact(
        {
          id: contact.id,
          name: contact.name,
          aliases: contact.aliases,
          email: contact.email,
          organization: contact.organization,
          notes: contact.notes,
        },
        terms,
        excludeContactIds,
      );
      if (!result) continue;

      const related = [
        ...contact.clientOfMatters.map((matter) => ({
          id: matter.id,
          title: matter.title,
          status: matter.status,
          role: "Client",
        })),
        ...contact.matterLinks.map((link) => ({
          id: link.matter.id,
          title: link.matter.title,
          status: link.matter.status,
          role: CONTACT_TYPE_LABELS[link.role] ?? titleCase(link.role),
        })),
      ];
      const uniqueMatters = Array.from(new Map(related.map((matter) => [matter.id, matter])).values());

      matches.push({
        contactId: contact.id,
        name: contact.name,
        type: contact.type,
        matchedFields: result.matchedFields,
        matchedTerms: result.matchedTerms,
        matters: uniqueMatters,
      });
    }
  }

  const matterMatches: ConflictMatterMatch[] =
    terms.length > 0
      ? matters
          .filter((matter) => {
            const haystack = [
              matter.title,
              matter.causeNumber ?? "",
              matter.notes ?? "",
              matter.client.name,
            ]
              .join(" ")
              .toLowerCase();
            return terms.some((term) => haystack.includes(term));
          })
          .map((matter) => ({
            id: matter.id,
            title: matter.title,
            causeNumber: matter.causeNumber,
            status: matter.status,
            clientName: matter.client.name,
          }))
      : [];

  return {
    status: matches.length > 0 || matterMatches.length > 0 ? "REVIEW" : "CLEAR",
    terms,
    matches,
    matterMatches,
    scannedContacts: contacts.length,
    scannedMatters: matters.length,
  };
}

export async function getIntakeSubmissions(user: SessionUser): Promise<IntakeSummary[]> {
  if (!can(user.role, "intake:view")) return [];
  const submissions = await prisma.intakeSubmission.findMany({
    where: { firmId: user.firmId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      matter: { select: { id: true, title: true, status: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  return submissions.map((submission) => ({
    id: submission.id,
    reference: submission.reference,
    name: submission.name,
    email: submission.email,
    organization: submission.organization,
    county: submission.county,
    practiceArea: submission.practiceArea,
    status: submission.status,
    conflictStatus: submission.conflictStatus,
    createdAt: submission.createdAt.toISOString(),
    matterId: submission.matter?.id ?? null,
    matterTitle: submission.matter?.title ?? null,
    matterStatus: submission.matter?.status ?? null,
    assignedToId: submission.assignedTo?.id ?? null,
    assignedToName: submission.assignedTo?.name ?? null,
  }));
}

export async function getIntakeSubmission(user: SessionUser, submissionId: string) {
  if (!can(user.role, "intake:view")) return null;
  const submission = await prisma.intakeSubmission.findFirst({
    where: { id: submissionId, firmId: user.firmId },
    include: {
      matter: { select: { id: true, title: true, status: true, causeNumber: true, county: true } },
      contact: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });
  if (!submission) return null;

  const snapshot =
    submission.conflictMatches && typeof submission.conflictMatches === "object"
      ? (submission.conflictMatches as unknown as ConflictSnapshot)
      : null;

  return {
    id: submission.id,
    reference: submission.reference,
    name: submission.name,
    email: submission.email,
    phone: submission.phone,
    organization: submission.organization,
    county: submission.county,
    practiceArea: submission.practiceArea,
    summary: submission.summary,
    opposingParties: submission.opposingParties,
    referralSource: submission.referralSource,
    status: submission.status,
    conflictStatus: submission.conflictStatus,
    conflictCheckedAt: submission.conflictCheckedAt?.toISOString() ?? null,
    createdAt: submission.createdAt.toISOString(),
    internalNote: submission.internalNote,
    assignedTo: submission.assignedTo,
    matter: submission.matter,
    contact: submission.contact,
    snapshot,
  };
}

export async function getIntakeSettings(user: SessionUser) {
  const [firm, total, newCount, reviewCount] = await Promise.all([
    prisma.firm.findUnique({
      where: { id: user.firmId },
      select: {
        intakeEnabled: true,
        intakeToken: true,
        intakeHeadline: true,
        intakeIntro: true,
        name: true,
      },
    }),
    prisma.intakeSubmission.count({ where: { firmId: user.firmId } }),
    prisma.intakeSubmission.count({ where: { firmId: user.firmId, status: "NEW" } }),
    prisma.intakeSubmission.count({ where: { firmId: user.firmId, conflictStatus: "REVIEW", status: "NEW" } }),
  ]);

  if (!firm) return null;
  return {
    enabled: firm.intakeEnabled,
    token: firm.intakeToken,
    headline: firm.intakeHeadline,
    intro: firm.intakeIntro,
    firmName: firm.name,
    total,
    newCount,
    reviewCount,
  };
}

export async function getNewIntakeCount(user: SessionUser): Promise<number> {
  if (!can(user.role, "intake:view")) return 0;
  return prisma.intakeSubmission.count({ where: { firmId: user.firmId, status: "NEW" } });
}
