"use server";

import { refresh } from "next/cache";
import * as z from "zod";
import { db } from "@/lib/db";
import { canManageApplication, requireUser } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { failed, type FormState } from "@/lib/forms";
import { formatDateTime, parseLocalDateTime } from "@/lib/labels";
import { InterviewMode, ScreeningDecision } from "@/generated/prisma/enums";

const denied: FormState = { message: "Anda tidak memiliki akses untuk tindakan ini." };

const ScheduleSchema = z.object({
  interviewerId: z.string().min(1, { error: "Pilih pewawancara." }),
  scheduledAt: z
    .string()
    .transform((v, ctx) => {
      const d = parseLocalDateTime(v);
      if (!d) {
        ctx.addIssue({ code: "custom", message: "Isi tanggal dan jam wawancara." });
        return z.NEVER;
      }
      return d;
    })
    .refine((d) => d.getTime() > Date.now() - 60 * 60 * 1000, { error: "Jadwal tidak boleh di masa lalu." }),
  durationMin: z.coerce.number({ error: "Isi durasi dalam menit." }).int().min(15, { error: "Minimal 15 menit." }).max(480),
  mode: z.enum(InterviewMode),
  locationOrLink: z.string().trim().min(3, { error: "Isi lokasi atau tautan meeting." }).max(300),
});

export async function scheduleInterview(applicationId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!(await canManageApplication(user, applicationId))) return denied;

  const parsed = ScheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);
  const data = parsed.data;

  const [interviewer, app] = await Promise.all([
    db.user.findFirst({ where: { id: data.interviewerId, isActive: true }, select: { id: true } }),
    db.application.findUnique({
      where: { id: applicationId },
      select: { stage: true, candidate: { select: { fullName: true } }, job: { select: { title: true } } },
    }),
  ]);
  if (!interviewer) return failed(formData, { interviewerId: ["Pewawancara tidak valid."] });
  if (!app) return denied;
  if (app.stage === "REJECTED" || app.stage === "WITHDRAWN" || app.stage === "HIRED") {
    return failed(formData, undefined, "Lamaran ini sudah selesai diproses; ubah tahapnya dulu jika ingin menjadwalkan wawancara.");
  }

  const moveToInterview = app.stage === "APPLIED" || app.stage === "SCREENING";
  const interview = await db.$transaction(async (tx) => {
    const created = await tx.interview.create({ data: { applicationId, ...data }, select: { id: true } });
    if (moveToInterview) {
      await tx.application.update({ where: { id: applicationId }, data: { stage: "INTERVIEW", stageChangedAt: new Date() } });
    }
    if (data.interviewerId !== user.id) {
      await tx.notification.create({
        data: {
          userId: data.interviewerId,
          type: "interview.assigned",
          title: "Anda dijadwalkan sebagai pewawancara",
          body: `${app.candidate.fullName} · ${app.job.title} · ${formatDateTime(data.scheduledAt)}`,
          link: `/dashboard/kandidat/${applicationId}`,
        },
      });
    }
    return created;
  });

  await writeAudit({
    actorId: user.id,
    action: "interview.scheduled",
    entityType: "Interview",
    entityId: interview.id,
    changes: { applicationId, scheduledAt: data.scheduledAt.toISOString(), interviewerId: data.interviewerId },
  });
  if (moveToInterview) {
    await writeAudit({
      actorId: user.id,
      action: "application.stage_changed",
      entityType: "Application",
      entityId: applicationId,
      changes: { from: app.stage, to: "INTERVIEW", reason: "interview.scheduled" },
    });
  }
  refresh();
  return { ok: true, attempt: Date.now() };
}

const FeedbackSchema = z.object({
  rating: z.coerce.number({ error: "Beri nilai 1–5." }).int().min(1, { error: "Beri nilai 1–5." }).max(5),
  recommendation: z.enum(ScreeningDecision, { error: "Pilih rekomendasi." }),
  feedback: z.string().trim().min(10, { error: "Tulis catatan minimal 10 karakter." }).max(5000),
});

export async function submitFeedback(interviewId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const interview = await db.interview.findUnique({ where: { id: interviewId }, select: { interviewerId: true } });
  // The interviewer writes their own feedback; HR/Admin may fill it in on their behalf
  if (!interview || (interview.interviewerId !== user.id && user.role !== "ADMIN" && user.role !== "HR")) return denied;

  const parsed = FeedbackSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);

  await db.interview.update({ where: { id: interviewId }, data: parsed.data });
  await writeAudit({
    actorId: user.id,
    action: "interview.feedback_submitted",
    entityType: "Interview",
    entityId: interviewId,
    changes: { rating: parsed.data.rating, recommendation: parsed.data.recommendation },
  });
  refresh();
  return { ok: true, attempt: Date.now() };
}

export async function cancelInterview(interviewId: string): Promise<FormState> {
  const user = await requireUser();
  const interview = await db.interview.findUnique({
    where: { id: interviewId },
    select: { applicationId: true, interviewerId: true, rating: true, scheduledAt: true },
  });
  if (!interview || !(await canManageApplication(user, interview.applicationId))) return denied;
  if (interview.rating !== null) return { message: "Wawancara yang sudah ada penilaiannya tidak bisa dibatalkan." };

  await db.interview.delete({ where: { id: interviewId } });
  await writeAudit({
    actorId: user.id,
    action: "interview.cancelled",
    entityType: "Interview",
    entityId: interviewId,
    changes: { applicationId: interview.applicationId, scheduledAt: interview.scheduledAt.toISOString() },
  });
  refresh();
  return { ok: true };
}
