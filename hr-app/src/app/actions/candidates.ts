"use server";

import { refresh } from "next/cache";
import * as z from "zod";
import { siteDb } from "@/lib/db";
import { canManageApplication, requireRole } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { failed, optionalText, type FormState } from "@/lib/forms";
import { screenApplication } from "@/lib/screening";
import { ApplicationStage, ScreeningDecision } from "@/generated/prisma/enums";

const denied: FormState = { message: "Anda tidak memiliki akses ke lamaran ini." };

export async function rescreen(applicationId: string): Promise<FormState> {
  const user = await requireRole("ADMIN", "HR");

  const result = await screenApplication(applicationId);
  if (!result.ok) return { message: result.error };

  await writeAudit({
    actorId: user.id,
    action: "screening.requested",
    entityType: "Application",
    entityId: applicationId,
    changes: { score: result.score },
  });
  refresh();
  return { ok: true };
}

const ReviewSchema = z.object({
  decision: z.enum(ScreeningDecision, { error: "Pilih keputusan." }),
  decisionNote: optionalText(1000),
});

export async function reviewScreening(screeningId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const db = await siteDb();
  const user = await requireRole("ADMIN", "HR", "HIRING_MANAGER");

  const screening = await db.screening.findUnique({ where: { id: screeningId }, select: { applicationId: true } });
  if (!screening || !(await canManageApplication(user, screening.applicationId))) return denied;

  const parsed = ReviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);

  await db.screening.update({
    where: { id: screeningId },
    data: { ...parsed.data, reviewedById: user.id, reviewedAt: new Date() },
  });
  await writeAudit({
    actorId: user.id,
    action: "screening.reviewed",
    entityType: "Screening",
    entityId: screeningId,
    changes: { decision: parsed.data.decision },
  });
  refresh();
  return { ok: true, attempt: Date.now() };
}

const StageSchema = z
  .object({
    stage: z.enum(ApplicationStage, { error: "Pilih tahap." }),
    rejectionReason: optionalText(500),
  })
  .refine((d) => d.stage !== "REJECTED" || d.rejectionReason, {
    path: ["rejectionReason"],
    error: "Tulis alasan penolakan (untuk catatan internal).",
  });

export async function changeStage(applicationId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const db = await siteDb();
  const user = await requireRole("ADMIN", "HR", "HIRING_MANAGER");
  if (!(await canManageApplication(user, applicationId))) return denied;

  const parsed = StageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);
  const { stage, rejectionReason } = parsed.data;

  const before = await db.application.findUnique({ where: { id: applicationId }, select: { stage: true } });
  if (!before) return denied;
  if (before.stage === stage) return { ok: true, attempt: Date.now() };

  await db.application.update({
    where: { id: applicationId },
    data: {
      stage,
      stageChangedAt: new Date(),
      rejectionReason: stage === "REJECTED" ? rejectionReason : null,
    },
  });
  await writeAudit({
    actorId: user.id,
    action: "application.stage_changed",
    entityType: "Application",
    entityId: applicationId,
    changes: { from: before.stage, to: stage },
  });
  refresh();
  return { ok: true, attempt: Date.now() };
}
