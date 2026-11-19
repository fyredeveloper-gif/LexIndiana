-- CreateTable
CREATE TABLE "SyncOperation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payload" TEXT,
    "baseUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pushedAt" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT
);

-- CreateTable
CREATE TABLE "SyncCursor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "lastPulledAt" DATETIME,
    "lastPushedAt" DATETIME,
    "lastBootstrapAt" DATETIME,
    "lastError" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SyncTombstone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "deletedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SyncConflict" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "localPayload" TEXT,
    "remotePayload" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "SyncOperation_firmId_createdAt_idx" ON "SyncOperation"("firmId", "createdAt");

-- CreateIndex
CREATE INDEX "SyncOperation_firmId_deviceId_pushedAt_idx" ON "SyncOperation"("firmId", "deviceId", "pushedAt");

-- CreateIndex
CREATE INDEX "SyncOperation_firmId_entity_entityId_idx" ON "SyncOperation"("firmId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "SyncCursor_firmId_idx" ON "SyncCursor"("firmId");

-- CreateIndex
CREATE INDEX "SyncTombstone_firmId_deletedAt_idx" ON "SyncTombstone"("firmId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncTombstone_firmId_entity_entityId_key" ON "SyncTombstone"("firmId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "SyncConflict_firmId_status_idx" ON "SyncConflict"("firmId", "status");
