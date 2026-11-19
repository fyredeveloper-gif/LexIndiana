-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "indianaAttorneyNumber" TEXT,
    "defaultHourlyRate" DECIMAL NOT NULL DEFAULT 0,
    "twoFactorSecret" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Firm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "invoiceSeq" INTEGER NOT NULL DEFAULT 0,
    "intakeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "intakeToken" TEXT,
    "intakeHeadline" TEXT,
    "intakeIntro" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Membership_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "title" TEXT,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "acceptedAt" DATETIME,
    "acceptedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invitation_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatterAccess" (
    "matterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("matterId", "userId"),
    CONSTRAINT "MatterAccess_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatterAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatterAccess_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "email" TEXT,
    "phone" TEXT,
    "organization" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contact_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Matter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "userId" TEXT,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "causeNumber" TEXT,
    "county" TEXT NOT NULL,
    "courtName" TEXT,
    "practiceArea" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INTAKE',
    "notes" TEXT,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Matter_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Matter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Matter_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatterContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatterContact_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatterContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatterContact_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatterContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "hourlyRate" DECIMAL NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "invoiceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimeEntry_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimeEntry_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimeEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issueDate" DATETIME NOT NULL,
    "dueDate" DATETIME,
    "notes" TEXT,
    "subtotal" DECIMAL NOT NULL,
    "total" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "timeEntryId" TEXT,
    "description" TEXT NOT NULL,
    "workDate" DATETIME NOT NULL,
    "hours" DECIMAL NOT NULL,
    "rate" DECIMAL NOT NULL,
    "amount" DECIMAL NOT NULL,
    CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Deadline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matterId" TEXT,
    "title" TEXT NOT NULL,
    "ruleKey" TEXT,
    "ruleCitation" TEXT,
    "triggerEvent" TEXT NOT NULL,
    "triggerDate" DATETIME NOT NULL,
    "serviceMethod" TEXT NOT NULL DEFAULT 'E_SERVICE',
    "daysAdded" INTEGER NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deadline_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deadline_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deadline_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "matterId" TEXT,
    "assigneeId" TEXT,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" DATETIME,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "matterId" TEXT,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'MEETING',
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CalendarEvent_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CalendarEvent_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CalendarEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "defaultMatterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentTemplate_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentTemplate_defaultMatterId_fkey" FOREIGN KEY ("defaultMatterId") REFERENCES "Matter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntakeSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "userId" TEXT,
    "assignedToId" TEXT,
    "reference" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "organization" TEXT,
    "county" TEXT NOT NULL,
    "practiceArea" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "opposingParties" TEXT,
    "referralSource" TEXT,
    "conflictStatus" TEXT NOT NULL DEFAULT 'SKIPPED',
    "conflictMatches" JSONB,
    "conflictCheckedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "internalNote" TEXT,
    "contactId" TEXT,
    "matterId" TEXT,
    "ipHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IntakeSubmission_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IntakeSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IntakeSubmission_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IntakeSubmission_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IntakeSubmission_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatterDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "templateId" TEXT,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'UPLOAD',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatterDocument_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatterDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatterDocument_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatterDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Firm_intakeToken_key" ON "Firm"("intakeToken");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_key" ON "Membership"("userId");

-- CreateIndex
CREATE INDEX "Membership_firmId_role_idx" ON "Membership"("firmId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_firmId_email_idx" ON "Invitation"("firmId", "email");

-- CreateIndex
CREATE INDEX "Invitation_expiresAt_idx" ON "Invitation"("expiresAt");

-- CreateIndex
CREATE INDEX "MatterAccess_userId_idx" ON "MatterAccess"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_firmId_createdAt_idx" ON "AuditLog"("firmId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_firmId_action_idx" ON "AuditLog"("firmId", "action");

-- CreateIndex
CREATE INDEX "Contact_firmId_type_idx" ON "Contact"("firmId", "type");

-- CreateIndex
CREATE INDEX "Contact_firmId_name_idx" ON "Contact"("firmId", "name");

-- CreateIndex
CREATE INDEX "Matter_firmId_status_idx" ON "Matter"("firmId", "status");

-- CreateIndex
CREATE INDEX "Matter_firmId_openedAt_idx" ON "Matter"("firmId", "openedAt");

-- CreateIndex
CREATE INDEX "Matter_firmId_clientId_idx" ON "Matter"("firmId", "clientId");

-- CreateIndex
CREATE INDEX "MatterContact_firmId_idx" ON "MatterContact"("firmId");

-- CreateIndex
CREATE UNIQUE INDEX "MatterContact_matterId_contactId_role_key" ON "MatterContact"("matterId", "contactId", "role");

-- CreateIndex
CREATE INDEX "TimeEntry_firmId_matterId_idx" ON "TimeEntry"("firmId", "matterId");

-- CreateIndex
CREATE INDEX "TimeEntry_firmId_invoiceId_idx" ON "TimeEntry"("firmId", "invoiceId");

-- CreateIndex
CREATE INDEX "TimeEntry_firmId_startedAt_idx" ON "TimeEntry"("firmId", "startedAt");

-- CreateIndex
CREATE INDEX "TimeEntry_firmId_userId_idx" ON "TimeEntry"("firmId", "userId");

-- CreateIndex
CREATE INDEX "Invoice_firmId_matterId_idx" ON "Invoice"("firmId", "matterId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_firmId_number_key" ON "Invoice"("firmId", "number");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "Deadline_firmId_dueDate_idx" ON "Deadline"("firmId", "dueDate");

-- CreateIndex
CREATE INDEX "Deadline_firmId_matterId_idx" ON "Deadline"("firmId", "matterId");

-- CreateIndex
CREATE INDEX "Task_firmId_completed_dueDate_idx" ON "Task"("firmId", "completed", "dueDate");

-- CreateIndex
CREATE INDEX "Task_firmId_matterId_idx" ON "Task"("firmId", "matterId");

-- CreateIndex
CREATE INDEX "Task_firmId_assigneeId_idx" ON "Task"("firmId", "assigneeId");

-- CreateIndex
CREATE INDEX "CalendarEvent_firmId_startsAt_idx" ON "CalendarEvent"("firmId", "startsAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_firmId_matterId_idx" ON "CalendarEvent"("firmId", "matterId");

-- CreateIndex
CREATE INDEX "DocumentTemplate_firmId_idx" ON "DocumentTemplate"("firmId");

-- CreateIndex
CREATE INDEX "IntakeSubmission_firmId_createdAt_idx" ON "IntakeSubmission"("firmId", "createdAt");

-- CreateIndex
CREATE INDEX "IntakeSubmission_firmId_status_idx" ON "IntakeSubmission"("firmId", "status");

-- CreateIndex
CREATE INDEX "IntakeSubmission_firmId_conflictStatus_idx" ON "IntakeSubmission"("firmId", "conflictStatus");

-- CreateIndex
CREATE INDEX "IntakeSubmission_firmId_assignedToId_idx" ON "IntakeSubmission"("firmId", "assignedToId");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeSubmission_firmId_reference_key" ON "IntakeSubmission"("firmId", "reference");

-- CreateIndex
CREATE INDEX "MatterDocument_firmId_matterId_idx" ON "MatterDocument"("firmId", "matterId");

