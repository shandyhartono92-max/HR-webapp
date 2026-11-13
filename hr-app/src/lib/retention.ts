import "server-only";
import { currentSite, siteDb } from "@/lib/db";
import { accountsDb } from "@/lib/accounts-db";
import { setAccess } from "@/lib/site-access";
import type { SiteCode } from "@/lib/sites";
import { deleteFile } from "@/lib/storage";
import type { ApplicationStage } from "@/generated/prisma/enums";

// UU PDP retention, run daily by scripts/retention.ts.
//
// Candidates: once retainUntil has passed, wipe personal data and CV files but keep
// the anonymous application rows, so hiring statistics (counts per job, stage,
// source, AI score) still add up. Skipped: candidates still being processed or
// hired (their data became employee data, handled below).
//
// Former employees: EMPLOYEE_RETENTION_YEARS (default 10, the tax record period of
// UU KUP Pasal 28) after their exit date, wipe personal data, identity numbers, bank
// details, letter PDFs and their recruitment record. Kept: employee number,
// department, position, dates and contracts, for headcount and tenure statistics.

const KEEP_STAGES: ApplicationStage[] = ["SCREENING", "INTERVIEW", "OFFER", "HIRED"];

export type RetentionResult = { candidateIds: string[]; filesDeleted: number; fileErrors: number };
export type EmployeeRetentionResult = { employeeIds: string[]; filesDeleted: number; fileErrors: number };

export const employeeRetentionYears = () => Number(process.env.EMPLOYEE_RETENTION_YEARS) || 10;

// Files go after the database commit: a leftover file is harmless, a database row
// pointing at a missing file is not
async function deleteFiles(keys: string[], result: { filesDeleted: number; fileErrors: number }) {
  for (const key of keys) {
    try {
      await deleteFile(key);
      result.filesDeleted++;
    } catch (error) {
      result.fileErrors++;
      console.error("Could not delete file", key, error);
    }
  }
}

const candidateSelect = {
  id: true,
  fullName: true,
  applications: {
    select: {
      id: true,
      resumes: { select: { fileKey: true } },
      letters: { select: { fileKey: true } }, // offer letters: name and salary in the PDF
    },
  },
  resumes: { select: { fileKey: true } }, // CVs added by HR before any job (bank data)
} as const;

type CandidateToWipe = {
  id: string;
  fullName: string;
  applications: { id: string; resumes: { fileKey: string }[]; letters: { fileKey: string | null }[] }[];
  resumes: { fileKey: string }[];
};

// In-app notifications that name a person always start with "<full name> · ".
// Matching that prefix (not "contains") keeps "Ani" from also hitting "Daniel".
const notificationsNaming = (fullName: string) => ({ body: { startsWith: `${fullName} · ` } });

// Wipes one candidate in a transaction; returns the CV and letter files to delete afterwards
async function anonymizeCandidate(candidate: CandidateToWipe, now: Date, reason: string) {
  const db = await siteDb();
  const applicationIds = candidate.applications.map((a) => a.id);
  // Several resume rows can share one stored file (attachToJob reuses it), so de-duplicate
  const fileKeys = [
    ...new Set([
      ...candidate.applications.flatMap((a) => a.resumes.map((r) => r.fileKey)),
      ...candidate.resumes.map((r) => r.fileKey),
      ...candidate.applications.flatMap((a) => a.letters.map((l) => l.fileKey)).filter((k): k is string => Boolean(k)),
    ]),
  ];
  const inApps = { applicationId: { in: applicationIds } };

  await db.$transaction([
    db.candidate.update({
      where: { id: candidate.id },
      data: {
        fullName: "Kandidat dihapus",
        email: `dihapus-${candidate.id}@anonim.invalid`,
        phone: "-",
        city: null,
        lastEducation: null,
        // The database rule needs evidence on HR-attested rows; keep the fact, drop the detail
        consentEvidence: "(dihapus)",
        anonymizedAt: now,
      },
    }),
    db.resume.deleteMany({ where: { OR: [inApps, { candidateId: candidate.id }] } }),
    // Keep the score for statistics; drop text that describes the person
    db.screening.updateMany({ where: inApps, data: { summary: "", strengths: [], gaps: [], decisionNote: null } }),
    db.interview.updateMany({ where: inApps, data: { feedback: null } }),
    db.application.updateMany({ where: { id: { in: applicationIds } }, data: { rejectionReason: null } }),
    // Offer letters: keep the number (numbering stays continuous), drop the person and the PDF
    db.letter.updateMany({ where: inApps, data: { recipientName: "Kandidat dihapus", reason: null, fileKey: null, documentId: null } }),
    db.notification.deleteMany({ where: notificationsNaming(candidate.fullName) }),
    db.auditLog.create({
      data: {
        action: "candidate.anonymized",
        entityType: "Candidate",
        entityId: candidate.id,
        changes: { applications: applicationIds.length, files: fileKeys.length, reason },
      },
    }),
  ]);
  return fileKeys;
}

export async function anonymizeExpiredCandidates({ dryRun = false, now = new Date() } = {}): Promise<RetentionResult> {
  const db = await siteDb();
  const candidates = await db.candidate.findMany({
    where: {
      anonymizedAt: null,
      retainUntil: { lt: now },
      applications: { none: { OR: [{ stage: { in: KEEP_STAGES } }, { employee: { isNot: null } }] } },
    },
    select: candidateSelect,
  });

  const result: RetentionResult = { candidateIds: candidates.map((c) => c.id), filesDeleted: 0, fileErrors: 0 };
  if (dryRun) return result;

  for (const candidate of candidates) {
    await deleteFiles(await anonymizeCandidate(candidate, now, "retention"), result);
  }
  return result;
}

// The anonymised employee's login: access to this location goes; an account left with
// no access anywhere is anonymised and switched off as well
async function closeLoginAfterRetention(accountId: string, site: SiteCode) {
  // Anonymise the account first, so nothing can copy its real name back afterwards
  const elsewhere = await accountsDb.siteAccess.count({ where: { accountId, site: { not: site } } });
  if (elsewhere === 0) {
    await accountsDb.account.update({
      where: { id: accountId },
      data: { name: "Karyawan dihapus", email: `dihapus-${accountId}@anonim.invalid`, passwordHash: "", isActive: false },
    });
  }
  await setAccess(accountId, site, null);
}

export async function anonymizeFormerEmployees({ dryRun = false, now = new Date() } = {}): Promise<EmployeeRetentionResult> {
  const db = await siteDb();
  const site = (await currentSite()).code;
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - employeeRetentionYears());

  const employees = await db.employee.findMany({
    where: {
      anonymizedAt: null,
      status: { in: ["RESIGNED", "TERMINATED", "CONTRACT_ENDED"] },
      exitDate: { not: null, lt: cutoff },
    },
    select: {
      id: true,
      fullName: true,
      userId: true,
      application: { select: { candidate: { select: { ...candidateSelect, anonymizedAt: true } } } },
      letters: { select: { fileKey: true } },
      documents: { select: { id: true, fileKey: true } },
    },
  });

  const result: EmployeeRetentionResult = { employeeIds: employees.map((e) => e.id), filesDeleted: 0, fileErrors: 0 };
  if (dryRun) return result;

  for (const e of employees) {
    const files = [...e.letters.map((l) => l.fileKey), ...e.documents.map((d) => d.fileKey)].filter((k): k is string => Boolean(k));
    const documentIds = e.documents.map((d) => d.id);

    await db.$transaction([
      db.employee.update({
        where: { id: e.id },
        data: {
          fullName: "Karyawan dihapus",
          email: `dihapus-${e.id}@anonim.invalid`,
          phone: "-",
          birthPlace: null,
          birthDate: null,
          gender: null,
          address: null,
          motherMaidenName: null,
          ptkpStatus: null,
          nikKtpEnc: null,
          nikKtpLast4: null,
          npwpEnc: null,
          npwpLast4: null,
          bpjsKesehatanEnc: null,
          bpjsKesehatanLast4: null,
          bpjsKetenagakerjaanEnc: null,
          bpjsKetenagakerjaanLast4: null,
          anonymizedAt: now,
        },
      }),
      db.contract.updateMany({ where: { employeeId: e.id }, data: { baseSalaryEnc: null, documentId: null } }),
      db.letter.updateMany({
        where: { employeeId: e.id },
        data: { recipientName: "Karyawan dihapus", reason: null, fileKey: null, documentId: null },
      }),
      db.document.deleteMany({ where: { id: { in: documentIds } } }),
      db.bankAccount.updateMany({
        where: { employeeId: e.id },
        data: { accountNumberEnc: "", accountNumberLast4: "----", accountHolderName: "(dihapus)", isActive: false },
      }),
      db.bankChangeRequest.updateMany({
        where: { employeeId: e.id },
        data: { accountNumberEnc: "", accountNumberLast4: "----", accountHolderName: "(dihapus)", inquiryName: null, submittedIp: null, rejectionReason: null, otpHash: null },
      }),
      // HR notifications naming them, and everything sent to their own login
      db.notification.deleteMany({ where: { OR: [notificationsNaming(e.fullName), ...(e.userId ? [{ userId: e.userId }] : [])] } }),
      ...(e.userId
        ? [db.user.update({ where: { id: e.userId }, data: { name: "Karyawan dihapus", email: `dihapus-${e.userId}@anonim.invalid`, isActive: false } })]
        : []),
      db.auditLog.create({
        data: {
          action: "employee.anonymized",
          entityType: "Employee",
          entityId: e.id,
          changes: { files: files.length, retentionYears: employeeRetentionYears() },
        },
      }),
    ]);

    // Their login: no access here any more; with no access anywhere else the account
    // itself is anonymised too (it holds the same name and email)
    if (e.userId) await closeLoginAfterRetention(e.userId, site);

    // Their recruitment record holds the same personal data (CV, contact details)
    const candidate = e.application?.candidate;
    if (candidate && !candidate.anonymizedAt) files.push(...(await anonymizeCandidate(candidate, now, "employee_retention")));

    await deleteFiles([...new Set(files)], result);
  }
  return result;
}
