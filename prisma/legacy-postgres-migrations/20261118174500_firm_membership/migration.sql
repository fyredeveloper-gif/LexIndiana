-- Firm tenancy + staff roles.
-- Existing accounts become single-owner firms; every firm-owned row is
-- backfilled with its creator's new firm id before columns become NOT NULL.

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('OWNER', 'ATTORNEY', 'PARALEGAL', 'CLM', 'CONSULTANT');

-- CreateTable
CREATE TABLE "Firm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "invoiceSeq" INTEGER NOT NULL DEFAULT 0,
    "intakeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "intakeToken" TEXT,
    "intakeHeadline" TEXT,
    "intakeIntro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Firm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatterAccess" (
    "matterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatterAccess_pkey" PRIMARY KEY ("matterId","userId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- DropForeignKey (userId becomes optional attribution on three tables)
ALTER TABLE "Contact" DROP CONSTRAINT "Contact_userId_fkey";
ALTER TABLE "IntakeSubmission" DROP CONSTRAINT "IntakeSubmission_userId_fkey";
ALTER TABLE "Matter" DROP CONSTRAINT "Matter_userId_fkey";

-- DropIndex (tenant key moves from userId to firmId)
DROP INDEX "Contact_userId_name_idx";
DROP INDEX "Contact_userId_type_idx";
DROP INDEX "Deadline_userId_dueDate_idx";
DROP INDEX "Deadline_userId_matterId_idx";
DROP INDEX "DocumentTemplate_userId_idx";
DROP INDEX "IntakeSubmission_userId_conflictStatus_idx";
DROP INDEX "IntakeSubmission_userId_createdAt_idx";
DROP INDEX "IntakeSubmission_userId_reference_key";
DROP INDEX "IntakeSubmission_userId_status_idx";
DROP INDEX "Invoice_userId_matterId_idx";
DROP INDEX "Invoice_userId_number_key";
DROP INDEX "Matter_userId_clientId_idx";
DROP INDEX "Matter_userId_openedAt_idx";
DROP INDEX "Matter_userId_status_idx";
DROP INDEX "MatterContact_userId_idx";
DROP INDEX "MatterDocument_userId_matterId_idx";
DROP INDEX "TimeEntry_userId_invoiceId_idx";
DROP INDEX "TimeEntry_userId_matterId_idx";
DROP INDEX "TimeEntry_userId_startedAt_idx";
DROP INDEX "User_intakeToken_key";

-- Add firmId as nullable while it is backfilled.
ALTER TABLE "Contact" ADD COLUMN "firmId" TEXT, ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Deadline" ADD COLUMN "firmId" TEXT;
ALTER TABLE "DocumentTemplate" ADD COLUMN "firmId" TEXT;
ALTER TABLE "IntakeSubmission"
  ADD COLUMN "assignedToId" TEXT,
  ADD COLUMN "firmId" TEXT,
  ADD COLUMN "internalNote" TEXT,
  ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Invoice" ADD COLUMN "firmId" TEXT;
ALTER TABLE "Matter" ADD COLUMN "firmId" TEXT, ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "MatterContact" ADD COLUMN "firmId" TEXT;
ALTER TABLE "MatterDocument" ADD COLUMN "firmId" TEXT;
ALTER TABLE "TimeEntry" ADD COLUMN "firmId" TEXT;

-- One firm per existing account, with the account as OWNER. Firm ids are
-- deterministic so tenant rows can be backfilled in plain SQL.
INSERT INTO "Firm" (
  "id", "name", "address", "phone", "email", "invoiceSeq",
  "intakeEnabled", "intakeToken", "intakeHeadline", "intakeIntro",
  "createdAt", "updatedAt"
)
SELECT
  'f' || substr(md5(u."id"), 1, 24),
  COALESCE(NULLIF(btrim(u."firmName"), ''), u."name" || ' Law'),
  u."firmAddress", u."firmPhone", u."firmEmail",
  0,
  u."intakeEnabled", u."intakeToken", u."intakeHeadline", u."intakeIntro",
  u."createdAt", now()
FROM "User" u;

INSERT INTO "Membership" ("id", "firmId", "userId", "role", "createdAt", "updatedAt")
SELECT
  'm' || substr(md5(u."id"), 1, 24),
  'f' || substr(md5(u."id"), 1, 24),
  u."id",
  'OWNER',
  now(), now()
FROM "User" u;

UPDATE "Contact" SET "firmId" = 'f' || substr(md5("userId"), 1, 24) WHERE "firmId" IS NULL;
UPDATE "Deadline" SET "firmId" = 'f' || substr(md5("userId"), 1, 24) WHERE "firmId" IS NULL;
UPDATE "DocumentTemplate" SET "firmId" = 'f' || substr(md5("userId"), 1, 24) WHERE "firmId" IS NULL;
UPDATE "IntakeSubmission" SET "firmId" = 'f' || substr(md5("userId"), 1, 24) WHERE "firmId" IS NULL;
UPDATE "Invoice" SET "firmId" = 'f' || substr(md5("userId"), 1, 24) WHERE "firmId" IS NULL;
UPDATE "Matter" SET "firmId" = 'f' || substr(md5("userId"), 1, 24) WHERE "firmId" IS NULL;
UPDATE "MatterContact" SET "firmId" = 'f' || substr(md5("userId"), 1, 24) WHERE "firmId" IS NULL;
UPDATE "MatterDocument" SET "firmId" = 'f' || substr(md5("userId"), 1, 24) WHERE "firmId" IS NULL;
UPDATE "TimeEntry" SET "firmId" = 'f' || substr(md5("userId"), 1, 24) WHERE "firmId" IS NULL;

-- Existing invoice numbers were sequential per account; carry the count over.
UPDATE "Firm" f
SET "invoiceSeq" = (SELECT count(*) FROM "Invoice" i WHERE i."firmId" = f."id");

-- Drop the old per-user intake/profile columns now that the firm owns them.
ALTER TABLE "User"
  DROP COLUMN "firmAddress",
  DROP COLUMN "firmEmail",
  DROP COLUMN "firmName",
  DROP COLUMN "firmPhone",
  DROP COLUMN "intakeEnabled",
  DROP COLUMN "intakeHeadline",
  DROP COLUMN "intakeIntro",
  DROP COLUMN "intakeToken";

-- Enforce the tenant key.
ALTER TABLE "Contact" ALTER COLUMN "firmId" SET NOT NULL;
ALTER TABLE "Deadline" ALTER COLUMN "firmId" SET NOT NULL;
ALTER TABLE "DocumentTemplate" ALTER COLUMN "firmId" SET NOT NULL;
ALTER TABLE "IntakeSubmission" ALTER COLUMN "firmId" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "firmId" SET NOT NULL;
ALTER TABLE "Matter" ALTER COLUMN "firmId" SET NOT NULL;
ALTER TABLE "MatterContact" ALTER COLUMN "firmId" SET NOT NULL;
ALTER TABLE "MatterDocument" ALTER COLUMN "firmId" SET NOT NULL;
ALTER TABLE "TimeEntry" ALTER COLUMN "firmId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Firm_intakeToken_key" ON "Firm"("intakeToken");
CREATE UNIQUE INDEX "Membership_userId_key" ON "Membership"("userId");
CREATE INDEX "Membership_firmId_role_idx" ON "Membership"("firmId", "role");
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
CREATE INDEX "Invitation_firmId_email_idx" ON "Invitation"("firmId", "email");
CREATE INDEX "Invitation_expiresAt_idx" ON "Invitation"("expiresAt");
CREATE INDEX "MatterAccess_userId_idx" ON "MatterAccess"("userId");
CREATE INDEX "AuditLog_firmId_createdAt_idx" ON "AuditLog"("firmId", "createdAt");
CREATE INDEX "AuditLog_firmId_action_idx" ON "AuditLog"("firmId", "action");
CREATE INDEX "Contact_firmId_type_idx" ON "Contact"("firmId", "type");
CREATE INDEX "Contact_firmId_name_idx" ON "Contact"("firmId", "name");
CREATE INDEX "Deadline_firmId_dueDate_idx" ON "Deadline"("firmId", "dueDate");
CREATE INDEX "Deadline_firmId_matterId_idx" ON "Deadline"("firmId", "matterId");
CREATE INDEX "DocumentTemplate_firmId_idx" ON "DocumentTemplate"("firmId");
CREATE INDEX "IntakeSubmission_firmId_createdAt_idx" ON "IntakeSubmission"("firmId", "createdAt");
CREATE INDEX "IntakeSubmission_firmId_status_idx" ON "IntakeSubmission"("firmId", "status");
CREATE INDEX "IntakeSubmission_firmId_conflictStatus_idx" ON "IntakeSubmission"("firmId", "conflictStatus");
CREATE INDEX "IntakeSubmission_firmId_assignedToId_idx" ON "IntakeSubmission"("firmId", "assignedToId");
CREATE UNIQUE INDEX "IntakeSubmission_firmId_reference_key" ON "IntakeSubmission"("firmId", "reference");
CREATE INDEX "Invoice_firmId_matterId_idx" ON "Invoice"("firmId", "matterId");
CREATE UNIQUE INDEX "Invoice_firmId_number_key" ON "Invoice"("firmId", "number");
CREATE INDEX "Matter_firmId_status_idx" ON "Matter"("firmId", "status");
CREATE INDEX "Matter_firmId_openedAt_idx" ON "Matter"("firmId", "openedAt");
CREATE INDEX "Matter_firmId_clientId_idx" ON "Matter"("firmId", "clientId");
CREATE INDEX "MatterContact_firmId_idx" ON "MatterContact"("firmId");
CREATE INDEX "MatterDocument_firmId_matterId_idx" ON "MatterDocument"("firmId", "matterId");
CREATE INDEX "TimeEntry_firmId_matterId_idx" ON "TimeEntry"("firmId", "matterId");
CREATE INDEX "TimeEntry_firmId_invoiceId_idx" ON "TimeEntry"("firmId", "invoiceId");
CREATE INDEX "TimeEntry_firmId_startedAt_idx" ON "TimeEntry"("firmId", "startedAt");
CREATE INDEX "TimeEntry_firmId_userId_idx" ON "TimeEntry"("firmId", "userId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MatterAccess" ADD CONSTRAINT "MatterAccess_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatterAccess" ADD CONSTRAINT "MatterAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatterAccess" ADD CONSTRAINT "MatterAccess_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MatterContact" ADD CONSTRAINT "MatterContact_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntakeSubmission" ADD CONSTRAINT "IntakeSubmission_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntakeSubmission" ADD CONSTRAINT "IntakeSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IntakeSubmission" ADD CONSTRAINT "IntakeSubmission_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MatterDocument" ADD CONSTRAINT "MatterDocument_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
