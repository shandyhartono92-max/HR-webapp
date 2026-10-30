import "server-only";
import { db } from "@/lib/db";
import { deleteFile } from "@/lib/storage";
import type { ApplicationStage } from "@/generated/prisma/enums";

// UU PDP retention: once a candidate's retainUntil date has passed, wipe their
// personal data and CV files but keep the anonymous application rows, so hiring
// statistics (counts per job, stage, source, AI score) still add up.
//
// Skipped: candidates still being processed or already hired. Their data is
// needed for the running process or has become employee data.

const KEEP_STAGES: ApplicationStage[] = ["SCREENING", "INTERVIEW", "OFFER", "HIRED"];

export type RetentionResult = { candidateIds: string[]; filesDeleted: number; fileErrors: number };

export async function anonymizeExpiredCandidates({ dryRun = false, now = new Date() } = {}): Promise<RetentionResult> {
  const candidates = await db.candidate.findMany({
    where: {
      anonymizedAt: null,
      retainUntil: { lt: now },
      applications: { none: { OR: [{ stage: { in: KEEP_STAGES } }, { employee: { isNot: null } }] } },
    },
    select: {
      id: true,
      applications: { select: { id: true, resumes: { select: { fileKey: true } } } },
    },
  });

  const result: RetentionResult = { candidateIds: candidates.map((c) => c.id), filesDeleted: 0, fileErrors: 0 };
  if (dryRun) return result;

  for (const candidate of candidates) {
    const applicationIds = candidate.applications.map((a) => a.id);
    const fileKeys = candidate.applications.flatMap((a) => a.resumes.map((r) => r.fileKey));
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
          anonymizedAt: now,
        },
      }),
      db.resume.deleteMany({ where: inApps }),
      // Keep the score for statistics; drop text that describes the person
      db.screening.updateMany({ where: inApps, data: { summary: "", strengths: [], gaps: [], decisionNote: null } }),
      db.interview.updateMany({ where: inApps, data: { feedback: null } }),
      db.application.updateMany({ where: { id: { in: applicationIds } }, data: { rejectionReason: null } }),
      db.auditLog.create({
        data: {
          action: "candidate.anonymized",
          entityType: "Candidate",
          entityId: candidate.id,
          changes: { applications: applicationIds.length, files: fileKeys.length },
        },
      }),
    ]);

    // Files go after the database commit: a leftover file is harmless, a
    // database row pointing at a missing file is not
    for (const key of fileKeys) {
      try {
        await deleteFile(key);
        result.filesDeleted++;
      } catch (error) {
        result.fileErrors++;
        console.error("Could not delete file", key, error);
      }
    }
  }
  return result;
}
