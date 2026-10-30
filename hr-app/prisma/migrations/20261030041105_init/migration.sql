-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'HR', 'HIRING_MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('PKWT', 'PKWTT', 'MAGANG', 'HARIAN_LEPAS');

-- CreateEnum
CREATE TYPE "ApplicationStage" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ScreeningDecision" AS ENUM ('PROCEED', 'HOLD', 'REJECT');

-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('ONLINE', 'ONSITE');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'PROBATION', 'RESIGNED', 'TERMINATED', 'CONTRACT_ENDED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('L', 'P');

-- CreateEnum
CREATE TYPE "PtkpStatus" AS ENUM ('TK0', 'TK1', 'TK2', 'TK3', 'K0', 'K1', 'K2', 'K3');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('KTP', 'KK', 'NPWP', 'IJAZAH', 'TRANSKRIP', 'BPJS', 'CONTRACT', 'LETTER', 'CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "LetterType" AS ENUM ('OFFER_LETTER', 'SURAT_KETERANGAN_KERJA', 'PAKLARING', 'SP1', 'SP2', 'SP3', 'OTHER');

-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'SIGNED', 'DECLINED');

-- CreateEnum
CREATE TYPE "BankChangeStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "passwordHash" TEXT NOT NULL,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "hiringManagerId" TEXT NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT NOT NULL,
    "minEducation" TEXT,
    "minExperienceYears" INTEGER,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "showSalary" BOOLEAN NOT NULL DEFAULT false,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT,
    "lastEducation" TEXT,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "talentPoolConsent" BOOLEAN NOT NULL DEFAULT false,
    "retainUntil" TIMESTAMP(3) NOT NULL,
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stage" "ApplicationStage" NOT NULL DEFAULT 'APPLIED',
    "expectedSalary" INTEGER,
    "noticePeriodDays" INTEGER,
    "source" TEXT,
    "rejectionReason" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "interviewerId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "mode" "InterviewMode" NOT NULL,
    "locationOrLink" TEXT,
    "rating" INTEGER,
    "feedback" TEXT,
    "recommendation" "ScreeningDecision",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "extractedText" TEXT,
    "parsedData" JSONB,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Screening" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "strengths" JSONB NOT NULL,
    "gaps" JSONB NOT NULL,
    "aiModel" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "decision" "ScreeningDecision",
    "decisionNote" TEXT,

    CONSTRAINT "Screening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "userId" TEXT,
    "applicationId" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "managerId" TEXT,
    "employmentType" "EmploymentType" NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'PROBATION',
    "joinDate" DATE NOT NULL,
    "endDate" DATE,
    "birthPlace" TEXT,
    "birthDate" DATE,
    "gender" "Gender",
    "address" TEXT,
    "ptkpStatus" "PtkpStatus",
    "nikKtpEnc" TEXT,
    "nikKtpLast4" TEXT,
    "npwpEnc" TEXT,
    "npwpLast4" TEXT,
    "bpjsKesehatanEnc" TEXT,
    "bpjsKetenagakerjaanEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "EmploymentType" NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "baseSalaryEnc" TEXT,
    "documentId" TEXT,
    "renewalOfId" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousId" TEXT,
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" DATE,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterTemplate" (
    "id" TEXT NOT NULL,
    "type" "LetterType" NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LetterTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Letter" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "type" "LetterType" NOT NULL,
    "letterNumber" TEXT NOT NULL,
    "reason" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" DATE,
    "issuedById" TEXT NOT NULL,
    "documentId" TEXT,
    "signatureStatus" "SignatureStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "signatureRef" TEXT,

    CONSTRAINT "Letter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumberEnc" TEXT NOT NULL,
    "accountNumberLast4" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" DATE NOT NULL,
    "deactivatedAt" TIMESTAMP(3),
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankChangeRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumberEnc" TEXT NOT NULL,
    "accountNumberLast4" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "inquiryName" TEXT,
    "nameMatches" BOOLEAN,
    "status" "BankChangeStatus" NOT NULL DEFAULT 'DRAFT',
    "otpVerifiedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "submittedIp" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "effectivePayroll" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "changes" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Job_slug_key" ON "Job"("slug");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_email_key" ON "Candidate"("email");

-- CreateIndex
CREATE INDEX "Candidate_retainUntil_idx" ON "Candidate"("retainUntil");

-- CreateIndex
CREATE INDEX "Application_jobId_stage_idx" ON "Application"("jobId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "Application_candidateId_jobId_key" ON "Application"("candidateId", "jobId");

-- CreateIndex
CREATE INDEX "Interview_scheduledAt_idx" ON "Interview"("scheduledAt");

-- CreateIndex
CREATE INDEX "Screening_applicationId_createdAt_idx" ON "Screening"("applicationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeNumber_key" ON "Employee"("employeeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_applicationId_key" ON "Employee"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "Employee_status_idx" ON "Employee"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_contractNumber_key" ON "Contract"("contractNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_documentId_key" ON "Contract"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_renewalOfId_key" ON "Contract"("renewalOfId");

-- CreateIndex
CREATE INDEX "Contract_endDate_idx" ON "Contract"("endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Document_previousId_key" ON "Document"("previousId");

-- CreateIndex
CREATE INDEX "Document_employeeId_type_idx" ON "Document"("employeeId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "LetterTemplate_type_version_key" ON "LetterTemplate"("type", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Letter_letterNumber_key" ON "Letter"("letterNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Letter_documentId_key" ON "Letter"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_requestId_key" ON "BankAccount"("requestId");

-- CreateIndex
CREATE INDEX "BankAccount_employeeId_isActive_idx" ON "BankAccount"("employeeId", "isActive");

-- CreateIndex
CREATE INDEX "BankChangeRequest_status_idx" ON "BankChangeRequest"("status");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_headId_fkey" FOREIGN KEY ("headId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_hiringManagerId_fkey" FOREIGN KEY ("hiringManagerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Screening" ADD CONSTRAINT "Screening_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Screening" ADD CONSTRAINT "Screening_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_renewalOfId_fkey" FOREIGN KEY ("renewalOfId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_previousId_fkey" FOREIGN KEY ("previousId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LetterTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BankChangeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankChangeRequest" ADD CONSTRAINT "BankChangeRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankChangeRequest" ADD CONSTRAINT "BankChangeRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
