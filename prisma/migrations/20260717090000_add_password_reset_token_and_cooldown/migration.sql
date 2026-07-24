-- AlterTable
ALTER TABLE "password_reset_otps" ADD COLUMN     "resetTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "resetTokenHash" TEXT,
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "passwordResetLastRequestedAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetRequestCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_otps_resetTokenHash_key" ON "password_reset_otps"("resetTokenHash");
