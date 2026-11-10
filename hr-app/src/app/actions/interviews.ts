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
const notHeld = "Wawancara ini berstatus Reschedule/No show, jadi tidak bisa dinilai.";
const closedStages = ["REJECTED", "WITHDRAWN", "HIRED"];

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

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
type Slot = z.infer<typeof ScheduleSchema>;

// Creates the interview and tells the interviewer (unless they scheduled it themselves)
async function createInterview(
  tx: Tx,
  applicationId: string,
  data: Slot,
  actorId: string,
  app: { candidate: { fullName: string }; job: { title: string } },
  title: string,
) {
  const created = await tx.interview.create({ data: { applicationId, ...data }, select: { id: true } });
  if (data.interviewerId !== actorId) {
    await tx.notification.create({
      data: {
        userId: data.interviewerId,
        type: "interview.assigned",
        title,
        body: `${app.candidate.fullName} · ${app.job.title} · ${formatDateTime(data.scheduledAt)}`,
        link: `/dashboard/kandidat/${applicationId}`,
      },
    });
  }
  return created;
}

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
  if (closedStages.includes(app.stage)) {
    return failed(formData, undefined, "Lamaran ini sudah selesai diproses; ubah tahapnya dulu jika ingin menjadwalkan wawancara.");
  }

  const moveToInterview = app.stage === "APPLIED" || app.stage === "SCREENING";
  const interview = await db.$transaction(async (tx) => {
    const created = await createInterview(tx, applicationId, data, user.id, app, "Anda dijadwalkan sebagai pewawancara");
    if (moveToInterview) {
      await tx.application.update({ where: { id: applicationId }, data: { stage: "INTERVIEW", stageChangedAt: new Date() } });
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
  const interview = await db.interview.findUnique({ where: { id: interviewId }, select: { interviewerId: true, status: true } });
  // The interviewer writes their own feedback; HR/Admin may fill it in on their behalf
  if (!interview || (interview.interviewerId !== user.id && user.role !== "ADMIN" && user.role !== "HR")) return denied;
  if (interview.status !== "SCHEDULED") return { message: notHeld };

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
    select: { applicationId: true, interviewerId: true, rating: true, scheduledAt: true, status: true },
  });
  if (!interview || !(await canManageApplication(user, interview.applicationId))) return denied;
  if (interview.rating !== null) return { message: "Wawancara yang sudah ada penilaiannya tidak bisa dibatalkan." };
  // Rescheduled and no-show interviews stay as history
  if (interview.status !== "SCHEDULED") return { message: "Wawancara ini berstatus Reschedule/No show dan disimpan sebagai riwayat." };

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

// Moves an interview to a new slot. The old one stays in the history as RESCHEDULED.
export async function rescheduleInterview(interviewId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const old = await db.interview.findUnique({
    where: { id: interviewId },
    select: {
      applicationId: true,
      status: true,
      rating: true,
      scheduledAt: true,
      application: { select: { stage: true, candidate: { select: { fullName: true } }, job: { select: { title: true } } } },
    },
  });
  if (!old || !(await canManageApplication(user, old.applicationId))) return denied;
  if (old.rating !== null) return failed(formData, undefined, "Wawancara yang sudah dinilai tidak bisa di-reschedule.");
  if (old.status !== "SCHEDULED") return failed(formData, undefined, "Hanya wawancara berstatus Terjadwal yang bisa di-reschedule.");
  if (closedStages.includes(old.application.stage)) {
    return failed(formData, undefined, "Lamaran ini sudah selesai diproses; ubah tahapnya dulu jika ingin menjadwalkan wawancara.");
  }

  const parsed = ScheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);
  const data = parsed.data;
  const interviewer = await db.user.findFirst({ where: { id: data.interviewerId, isActive: true }, select: { id: true } });
  if (!interviewer) return failed(formData, { interviewerId: ["Pewawancara tidak valid."] });

  const created = await db.$transaction(async (tx) => {
    // Guarded update: a double submit or a parallel change finds nothing left to move
    const moved = await tx.interview.updateMany({
      where: { id: interviewId, status: "SCHEDULED", rating: null },
      data: { status: "RESCHEDULED" },
    });
    if (moved.count === 0) return null;
    return createInterview(tx, old.applicationId, data, user.id, old.application, "Jadwal wawancara diubah (reschedule)");
  });
  if (!created) return failed(formData, undefined, "Wawancara ini sudah diubah oleh orang lain. Muat ulang halaman.");

  await writeAudit({
    actorId: user.id,
    action: "interview.rescheduled",
    entityType: "Interview",
    entityId: created.id,
    changes: {
      applicationId: old.applicationId,
      fromInterviewId: interviewId,
      from: old.scheduledAt.toISOString(),
      to: data.scheduledAt.toISOString(),
      interviewerId: data.interviewerId,
    },
  });
  refresh();
  return { ok: true, attempt: Date.now() };
}

// Marks a candidate as not attending, or undoes a mistaken mark. Only after the
// interview time; the application stage is left for HR to decide.
export async function setNoShow(interviewId: string, noShow: boolean): Promise<FormState> {
  const user = await requireUser();
  const interview = await db.interview.findUnique({
    where: { id: interviewId },
    select: { applicationId: true, rating: true, scheduledAt: true },
  });
  if (!interview || !(await canManageApplication(user, interview.applicationId))) return denied;
  if (interview.rating !== null) return { message: "Wawancara yang sudah dinilai tidak bisa ditandai No show." };
  if (noShow && interview.scheduledAt.getTime() > Date.now()) return { message: "No show baru bisa ditandai setelah jam wawancara lewat." };

  const changed = await db.interview.updateMany({
    where: { id: interviewId, status: noShow ? "SCHEDULED" : "NO_SHOW", rating: null },
    data: { status: noShow ? "NO_SHOW" : "SCHEDULED" },
  });
  if (changed.count === 0) return { message: "Status wawancara ini sudah berubah. Muat ulang halaman." };

  await writeAudit({
    actorId: user.id,
    action: noShow ? "interview.no_show" : "interview.no_show_undone",
    entityType: "Interview",
    entityId: interviewId,
    changes: { applicationId: interview.applicationId },
  });
  refresh();
  return { ok: true };
}
