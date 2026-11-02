-- CreateEnum
CREATE TYPE "InterviewKitStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateTable
CREATE TABLE "InterviewKit" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "applicationId" TEXT,
    "status" "InterviewKitStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "aiModel" TEXT,
    "promptVersion" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewKit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterviewKit_applicationId_key" ON "InterviewKit"("applicationId");

-- CreateIndex
CREATE INDEX "InterviewKit_jobId_idx" ON "InterviewKit"("jobId");

-- AddForeignKey
ALTER TABLE "InterviewKit" ADD CONSTRAINT "InterviewKit_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewKit" ADD CONSTRAINT "InterviewKit_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewKit" ADD CONSTRAINT "InterviewKit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewKit" ADD CONSTRAINT "InterviewKit_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
