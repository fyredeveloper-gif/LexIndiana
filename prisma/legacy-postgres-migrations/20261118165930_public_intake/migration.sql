-- CreateEnum
CREATE TYPE "ConflictStatus" AS ENUM ('CLEAR', 'REVIEW', 'SKIPPED');

-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'DECLINED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "intakeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "intakeHeadline" TEXT,
ADD COLUMN     "intakeIntro" TEXT,
ADD COLUMN     "intakeToken" TEXT;

-- CreateTable
CREATE TABLE "IntakeSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
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
    "conflictStatus" "ConflictStatus" NOT NULL DEFAULT 'SKIPPED',
    "conflictMatches" JSONB,
    "conflictCheckedAt" TIMESTAMP(3),
    "status" "IntakeStatus" NOT NULL DEFAULT 'NEW',
    "contactId" TEXT,
    "matterId" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntakeSubmission_userId_createdAt_idx" ON "IntakeSubmission"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "IntakeSubmission_userId_status_idx" ON "IntakeSubmission"("userId", "status");

-- CreateIndex
CREATE INDEX "IntakeSubmission_userId_conflictStatus_idx" ON "IntakeSubmission"("userId", "conflictStatus");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeSubmission_userId_reference_key" ON "IntakeSubmission"("userId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "User_intakeToken_key" ON "User"("intakeToken");

-- AddForeignKey
ALTER TABLE "IntakeSubmission" ADD CONSTRAINT "IntakeSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeSubmission" ADD CONSTRAINT "IntakeSubmission_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeSubmission" ADD CONSTRAINT "IntakeSubmission_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

