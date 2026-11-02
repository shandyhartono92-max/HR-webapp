-- Baseline for MariaDB (XAMPP) / MySQL. The PostgreSQL history is kept in
-- prisma/migrations-postgresql for reference only.

-- CreateTable
CREATE TABLE `user` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'HR', 'HIRING_MANAGER', 'EMPLOYEE') NOT NULL DEFAULT 'EMPLOYEE',
    `passwordHash` VARCHAR(191) NOT NULL,
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    `twoFactorEnabled` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `department` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `headId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `department_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `hiringManagerName` VARCHAR(191) NOT NULL,
    `hiringManagerId` VARCHAR(191) NULL,
    `employmentType` ENUM('PKWT', 'PKWTT', 'MAGANG', 'HARIAN_LEPAS') NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `requirements` TEXT NOT NULL,
    `minEducation` VARCHAR(191) NULL,
    `minExperienceYears` INTEGER NULL,
    `salaryMin` INTEGER NULL,
    `salaryMax` INTEGER NULL,
    `showSalary` BOOLEAN NOT NULL DEFAULT false,
    `headcount` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('DRAFT', 'OPEN', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
    `openedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `job_slug_key`(`slug`),
    INDEX `job_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `candidate` (
    `id` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NULL,
    `lastEducation` VARCHAR(191) NULL,
    `source` VARCHAR(191) NULL,
    `consentAt` DATETIME(3) NOT NULL,
    `consentVersion` VARCHAR(191) NOT NULL,
    `consentMethod` ENUM('SELF_FORM', 'HR_ATTESTED') NOT NULL DEFAULT 'SELF_FORM',
    `consentEvidence` VARCHAR(300) NULL,
    `consentRecordedById` VARCHAR(191) NULL,
    `talentPoolConsent` BOOLEAN NOT NULL DEFAULT false,
    `retainUntil` DATETIME(3) NOT NULL,
    `anonymizedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `candidate_email_key`(`email`),
    INDEX `candidate_retainUntil_idx`(`retainUntil`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `application` (
    `id` VARCHAR(191) NOT NULL,
    `candidateId` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `stage` ENUM('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN') NOT NULL DEFAULT 'APPLIED',
    `expectedSalary` INTEGER NULL,
    `noticePeriodDays` INTEGER NULL,
    `source` VARCHAR(191) NULL,
    `rejectionReason` VARCHAR(500) NULL,
    `appliedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `stageChangedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `application_jobId_stage_idx`(`jobId`, `stage`),
    UNIQUE INDEX `application_candidateId_jobId_key`(`candidateId`, `jobId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `interview` (
    `id` VARCHAR(191) NOT NULL,
    `applicationId` VARCHAR(191) NOT NULL,
    `interviewerId` VARCHAR(191) NOT NULL,
    `scheduledAt` DATETIME(3) NOT NULL,
    `durationMin` INTEGER NOT NULL DEFAULT 60,
    `mode` ENUM('ONLINE', 'ONSITE') NOT NULL,
    `locationOrLink` VARCHAR(300) NULL,
    `rating` INTEGER NULL,
    `feedback` TEXT NULL,
    `recommendation` ENUM('PROCEED', 'HOLD', 'REJECT') NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `interview_scheduledAt_idx`(`scheduledAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `interview_kit` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `applicationId` VARCHAR(191) NULL,
    `status` ENUM('DRAFT', 'APPROVED') NOT NULL DEFAULT 'DRAFT',
    `content` JSON NOT NULL,
    `aiModel` VARCHAR(191) NULL,
    `promptVersion` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `interview_kit_applicationId_key`(`applicationId`),
    INDEX `interview_kit_jobId_idx`(`jobId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resume` (
    `id` VARCHAR(191) NOT NULL,
    `applicationId` VARCHAR(191) NULL,
    `candidateId` VARCHAR(191) NULL,
    `fileKey` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `extractedText` TEXT NULL,
    `parsedData` JSON NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `screening` (
    `id` VARCHAR(191) NOT NULL,
    `applicationId` VARCHAR(191) NOT NULL,
    `score` INTEGER NOT NULL,
    `summary` TEXT NOT NULL,
    `strengths` JSON NOT NULL,
    `gaps` JSON NOT NULL,
    `aiModel` VARCHAR(191) NOT NULL,
    `promptVersion` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `decision` ENUM('PROCEED', 'HOLD', 'REJECT') NULL,
    `decisionNote` VARCHAR(1000) NULL,

    INDEX `screening_applicationId_createdAt_idx`(`applicationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employee` (
    `id` VARCHAR(191) NOT NULL,
    `employeeNumber` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `applicationId` VARCHAR(191) NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `position` VARCHAR(191) NOT NULL,
    `managerId` VARCHAR(191) NULL,
    `employmentType` ENUM('PKWT', 'PKWTT', 'MAGANG', 'HARIAN_LEPAS') NOT NULL,
    `status` ENUM('ACTIVE', 'PROBATION', 'RESIGNED', 'TERMINATED', 'CONTRACT_ENDED') NOT NULL DEFAULT 'PROBATION',
    `joinDate` DATE NOT NULL,
    `endDate` DATE NULL,
    `birthPlace` VARCHAR(191) NULL,
    `birthDate` DATE NULL,
    `gender` ENUM('L', 'P') NULL,
    `address` VARCHAR(500) NULL,
    `ptkpStatus` ENUM('TK0', 'TK1', 'TK2', 'TK3', 'K0', 'K1', 'K2', 'K3') NULL,
    `nikKtpEnc` VARCHAR(191) NULL,
    `nikKtpLast4` VARCHAR(191) NULL,
    `npwpEnc` VARCHAR(191) NULL,
    `npwpLast4` VARCHAR(191) NULL,
    `bpjsKesehatanEnc` VARCHAR(191) NULL,
    `bpjsKesehatanLast4` VARCHAR(191) NULL,
    `bpjsKetenagakerjaanEnc` VARCHAR(191) NULL,
    `bpjsKetenagakerjaanLast4` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `employee_employeeNumber_key`(`employeeNumber`),
    UNIQUE INDEX `employee_userId_key`(`userId`),
    UNIQUE INDEX `employee_applicationId_key`(`applicationId`),
    UNIQUE INDEX `employee_email_key`(`email`),
    INDEX `employee_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contract` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `type` ENUM('PKWT', 'PKWTT', 'MAGANG', 'HARIAN_LEPAS') NOT NULL,
    `contractNumber` VARCHAR(191) NOT NULL,
    `position` VARCHAR(191) NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NULL,
    `baseSalaryEnc` VARCHAR(191) NULL,
    `documentId` VARCHAR(191) NULL,
    `renewalOfId` VARCHAR(191) NULL,
    `reminderSentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `contract_contractNumber_key`(`contractNumber`),
    UNIQUE INDEX `contract_documentId_key`(`documentId`),
    UNIQUE INDEX `contract_renewalOfId_key`(`renewalOfId`),
    INDEX `contract_endDate_idx`(`endDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `type` ENUM('KTP', 'KK', 'NPWP', 'IJAZAH', 'TRANSKRIP', 'BPJS', 'CONTRACT', 'LETTER', 'CERTIFICATE', 'OTHER') NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `fileKey` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `previousId` VARCHAR(191) NULL,
    `isSensitive` BOOLEAN NOT NULL DEFAULT false,
    `expiresAt` DATE NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `document_previousId_key`(`previousId`),
    INDEX `document_employeeId_type_idx`(`employeeId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `letter_template` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('OFFER_LETTER', 'SURAT_KETERANGAN_KERJA', 'PAKLARING', 'SP1', 'SP2', 'SP3', 'MUTASI', 'PROMOSI', 'DEMOSI', 'OTHER') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `letter_template_type_version_key`(`type`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `letter` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NULL,
    `applicationId` VARCHAR(191) NULL,
    `recipientName` VARCHAR(191) NOT NULL,
    `fileKey` VARCHAR(191) NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `type` ENUM('OFFER_LETTER', 'SURAT_KETERANGAN_KERJA', 'PAKLARING', 'SP1', 'SP2', 'SP3', 'MUTASI', 'PROMOSI', 'DEMOSI', 'OTHER') NOT NULL,
    `letterNumber` VARCHAR(191) NOT NULL,
    `reason` TEXT NULL,
    `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `validUntil` DATE NULL,
    `issuedById` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NULL,
    `signatureStatus` ENUM('NOT_REQUIRED', 'PENDING', 'SIGNED', 'DECLINED') NOT NULL DEFAULT 'NOT_REQUIRED',
    `signatureRef` VARCHAR(191) NULL,

    UNIQUE INDEX `letter_letterNumber_key`(`letterNumber`),
    UNIQUE INDEX `letter_documentId_key`(`documentId`),
    INDEX `letter_employeeId_idx`(`employeeId`),
    INDEX `letter_type_issuedAt_idx`(`type`, `issuedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bank_account` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `bankCode` VARCHAR(191) NOT NULL,
    `bankName` VARCHAR(191) NOT NULL,
    `accountNumberEnc` VARCHAR(191) NOT NULL,
    `accountNumberLast4` VARCHAR(191) NOT NULL,
    `accountHolderName` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `effectiveFrom` DATE NOT NULL,
    `deactivatedAt` DATETIME(3) NULL,
    `requestId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `bank_account_requestId_key`(`requestId`),
    INDEX `bank_account_employeeId_isActive_idx`(`employeeId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bank_change_request` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `bankCode` VARCHAR(191) NOT NULL,
    `bankName` VARCHAR(191) NOT NULL,
    `accountNumberEnc` VARCHAR(191) NOT NULL,
    `accountNumberLast4` VARCHAR(191) NOT NULL,
    `accountHolderName` VARCHAR(191) NOT NULL,
    `inquiryName` VARCHAR(191) NULL,
    `nameMatches` BOOLEAN NULL,
    `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `otpHash` VARCHAR(191) NULL,
    `otpExpiresAt` DATETIME(3) NULL,
    `otpAttempts` INTEGER NOT NULL DEFAULT 0,
    `otpVerifiedAt` DATETIME(3) NULL,
    `submittedAt` DATETIME(3) NULL,
    `submittedIp` VARCHAR(191) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `rejectionReason` VARCHAR(500) NULL,
    `effectivePayroll` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `bank_change_request_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_log` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `changes` JSON NULL,
    `ip` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_log_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `audit_log_actorId_createdAt_idx`(`actorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `link` VARCHAR(191) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_userId_readAt_idx`(`userId`, `readAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `department` ADD CONSTRAINT `department_headId_fkey` FOREIGN KEY (`headId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job` ADD CONSTRAINT `job_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job` ADD CONSTRAINT `job_hiringManagerId_fkey` FOREIGN KEY (`hiringManagerId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `candidate` ADD CONSTRAINT `candidate_consentRecordedById_fkey` FOREIGN KEY (`consentRecordedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `application` ADD CONSTRAINT `application_candidateId_fkey` FOREIGN KEY (`candidateId`) REFERENCES `candidate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `application` ADD CONSTRAINT `application_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `job`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `interview` ADD CONSTRAINT `interview_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `application`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `interview` ADD CONSTRAINT `interview_interviewerId_fkey` FOREIGN KEY (`interviewerId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `interview_kit` ADD CONSTRAINT `interview_kit_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `job`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `interview_kit` ADD CONSTRAINT `interview_kit_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `application`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `interview_kit` ADD CONSTRAINT `interview_kit_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `interview_kit` ADD CONSTRAINT `interview_kit_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resume` ADD CONSTRAINT `resume_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `application`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resume` ADD CONSTRAINT `resume_candidateId_fkey` FOREIGN KEY (`candidateId`) REFERENCES `candidate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `screening` ADD CONSTRAINT `screening_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `application`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `screening` ADD CONSTRAINT `screening_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee` ADD CONSTRAINT `employee_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee` ADD CONSTRAINT `employee_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `application`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee` ADD CONSTRAINT `employee_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee` ADD CONSTRAINT `employee_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract` ADD CONSTRAINT `contract_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract` ADD CONSTRAINT `contract_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `document`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract` ADD CONSTRAINT `contract_renewalOfId_fkey` FOREIGN KEY (`renewalOfId`) REFERENCES `contract`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document` ADD CONSTRAINT `document_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document` ADD CONSTRAINT `document_previousId_fkey` FOREIGN KEY (`previousId`) REFERENCES `document`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document` ADD CONSTRAINT `document_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `letter` ADD CONSTRAINT `letter_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `letter` ADD CONSTRAINT `letter_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `application`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `letter` ADD CONSTRAINT `letter_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `letter_template`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `letter` ADD CONSTRAINT `letter_issuedById_fkey` FOREIGN KEY (`issuedById`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `letter` ADD CONSTRAINT `letter_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `document`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_account` ADD CONSTRAINT `bank_account_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_account` ADD CONSTRAINT `bank_account_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `bank_change_request`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_change_request` ADD CONSTRAINT `bank_change_request_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_change_request` ADD CONSTRAINT `bank_change_request_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification` ADD CONSTRAINT `notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────
-- Rules Prisma's schema language cannot express (ported from PostgreSQL).
-- Triggers and CHECK constraints are invisible to Prisma, so they do not
-- show up as schema drift. Table names are lowercase so a dump made on
-- Windows also works on a Linux MySQL/MariaDB host.
-- ─────────────────────────────────────────────────────────────

-- 1. Audit log is append-only: reject UPDATE and DELETE for every database user
CREATE TRIGGER `audit_log_no_update` BEFORE UPDATE ON `audit_log` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog is append-only';

CREATE TRIGGER `audit_log_no_delete` BEFORE DELETE ON `audit_log` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog is append-only';

-- 2. At most one active bank account per employee (PostgreSQL used a partial unique
--    index, which MariaDB does not have). The approval flow deactivates the old
--    account before inserting the new one.
CREATE TRIGGER `bank_account_one_active_insert` BEFORE INSERT ON `bank_account` FOR EACH ROW
BEGIN
  IF NEW.`isActive` AND EXISTS (
    SELECT 1 FROM `bank_account` WHERE `employeeId` = NEW.`employeeId` AND `isActive`
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only one active bank account per employee';
  END IF;
END;

CREATE TRIGGER `bank_account_one_active_update` BEFORE UPDATE ON `bank_account` FOR EACH ROW
BEGIN
  IF NEW.`isActive` AND EXISTS (
    SELECT 1 FROM `bank_account` WHERE `employeeId` = NEW.`employeeId` AND `isActive` AND `id` <> NEW.`id`
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only one active bank account per employee';
  END IF;
END;

-- 3. PKWT contracts must have an end date
ALTER TABLE `contract` ADD CONSTRAINT `contract_pkwt_has_end_date`
  CHECK (`type` <> 'PKWT' OR `endDate` IS NOT NULL);

-- 4–6 are triggers, not CHECKs: MariaDB rejects a CHECK on a column whose
-- foreign key has ON DELETE/UPDATE actions (error 1901).

-- 4. A letter is addressed to an employee or to a candidate's application
CREATE TRIGGER `letter_has_recipient_insert` BEFORE INSERT ON `letter` FOR EACH ROW
BEGIN
  IF NEW.`employeeId` IS NULL AND NEW.`applicationId` IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Letter needs an employee or an application';
  END IF;
END;

CREATE TRIGGER `letter_has_recipient_update` BEFORE UPDATE ON `letter` FOR EACH ROW
BEGIN
  IF NEW.`employeeId` IS NULL AND NEW.`applicationId` IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Letter needs an employee or an application';
  END IF;
END;

-- 5. A CV belongs to an application or directly to a candidate
CREATE TRIGGER `resume_has_owner_insert` BEFORE INSERT ON `resume` FOR EACH ROW
BEGIN
  IF NEW.`applicationId` IS NULL AND NEW.`candidateId` IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Resume needs an application or a candidate';
  END IF;
END;

CREATE TRIGGER `resume_has_owner_update` BEFORE UPDATE ON `resume` FOR EACH ROW
BEGIN
  IF NEW.`applicationId` IS NULL AND NEW.`candidateId` IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Resume needs an application or a candidate';
  END IF;
END;

-- 6. Consent recorded by HR needs the evidence and who recorded it
CREATE TRIGGER `candidate_attested_consent_insert` BEFORE INSERT ON `candidate` FOR EACH ROW
BEGIN
  IF NEW.`consentMethod` = 'HR_ATTESTED' AND (NEW.`consentEvidence` IS NULL OR NEW.`consentRecordedById` IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'HR-attested consent needs evidence and recorder';
  END IF;
END;

CREATE TRIGGER `candidate_attested_consent_update` BEFORE UPDATE ON `candidate` FOR EACH ROW
BEGIN
  IF NEW.`consentMethod` = 'HR_ATTESTED' AND (NEW.`consentEvidence` IS NULL OR NEW.`consentRecordedById` IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'HR-attested consent needs evidence and recorder';
  END IF;
END;