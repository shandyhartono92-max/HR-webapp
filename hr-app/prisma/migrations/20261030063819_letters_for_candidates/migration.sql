/*
  Warnings:

  - Added the required column `recipientName` to the `Letter` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Letter" DROP CONSTRAINT "Letter_employeeId_fkey";

-- AlterTable
ALTER TABLE "Letter" ADD COLUMN     "applicationId" TEXT,
ADD COLUMN     "fileKey" TEXT,
ADD COLUMN     "recipientName" TEXT NOT NULL,
ALTER COLUMN "employeeId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Letter_employeeId_idx" ON "Letter"("employeeId");

-- CreateIndex
CREATE INDEX "Letter_type_issuedAt_idx" ON "Letter"("type", "issuedAt");

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A letter is addressed to an employee or to a candidate's application
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_has_recipient" CHECK ("employeeId" IS NOT NULL OR "applicationId" IS NOT NULL);
