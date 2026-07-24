-- CreateTable
CREATE TABLE "audit_log_entries" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_entries_adminUserId_idx" ON "audit_log_entries"("adminUserId");

-- CreateIndex
CREATE INDEX "audit_log_entries_targetType_targetId_idx" ON "audit_log_entries"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "audit_log_entries_action_idx" ON "audit_log_entries"("action");

-- CreateIndex
CREATE INDEX "audit_log_entries_createdAt_idx" ON "audit_log_entries"("createdAt");

-- AddForeignKey
ALTER TABLE "audit_log_entries" ADD CONSTRAINT "audit_log_entries_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
