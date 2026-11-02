-- Hiring manager on a job is typed freely; the user link becomes optional.

-- Keep the name of the manager already chosen on existing jobs
ALTER TABLE "Job" ADD COLUMN "hiringManagerName" TEXT;
UPDATE "Job" j SET "hiringManagerName" = u."name" FROM "User" u WHERE u."id" = j."hiringManagerId";
UPDATE "Job" SET "hiringManagerName" = '-' WHERE "hiringManagerName" IS NULL;
ALTER TABLE "Job" ALTER COLUMN "hiringManagerName" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "Job" DROP CONSTRAINT "Job_hiringManagerId_fkey";

-- AlterTable
ALTER TABLE "Job" ALTER COLUMN "hiringManagerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_hiringManagerId_fkey" FOREIGN KEY ("hiringManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
