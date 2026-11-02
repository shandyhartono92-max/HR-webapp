"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { checkbox, failed, optionalText, type FormState } from "@/lib/forms";
import { isIndonesianMobile, normalizePhone } from "@/lib/indonesia-id";
import { educationLevels, manualSources } from "@/lib/labels";
import { MAX_CV_BYTES, PRIVACY_NOTICE_VERSION, retainUntil } from "@/lib/privacy";
import { isScreeningConfigured, screenApplication } from "@/lib/screening";
import { deleteFile, detectCvType, saveFile } from "@/lib/storage";
import { MAX_IMPORT_BYTES, parseImportFile } from "@/lib/candidate-import";
import type { ImportState } from "@/lib/excel";

const sourceKeys = Object.keys(manualSources) as [keyof typeof manualSources, ...(keyof typeof manualSources)[]];

const AddSchema = z.object({
  fullName: z.string().trim().min(3, { error: "Nama minimal 3 karakter." }).max(120),
  email: z.email({ error: "Masukkan email yang valid." }).trim().toLowerCase(),
  phone: z
    .string()
    .refine(isIndonesianMobile, { error: "Masukkan nomor HP Indonesia, misal 0812xxxxxxx." })
    .transform(normalizePhone),
  city: optionalText(80),
  lastEducation: z.enum(educationLevels, { error: "Pilih pendidikan terakhir." }),
  source: z.enum(sourceKeys, { error: "Pilih sumber kandidat." }),
  jobId: optionalText(40),
  consentConfirmed: z.literal("on", { error: "Kandidat harus sudah menyetujui datanya disimpan." }),
  consentEvidence: z.string().trim().min(5, { error: "Tulis bukti persetujuan, misal: setuju via email 30 Okt 2026." }).max(300),
  talentPool: checkbox,
});

function scheduleScreening(applicationId: string) {
  if (!isScreeningConfigured()) return;
  after(async () => {
    const r = await screenApplication(applicationId);
    if (!r.ok) console.error("Auto-screening failed", applicationId, r.error);
  });
}

// HR adds a candidate whose CV came in outside the careers page (email, WhatsApp, job fair…).
// Consent is attested by HR with evidence, as the candidate did not tick the form themselves.
export async function addCandidate(_state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN", "HR");

  const parsed = AddSchema.safeParse(Object.fromEntries(formData));
  const errors: Record<string, string[] | undefined> = parsed.success ? {} : z.flattenError(parsed.error).fieldErrors;

  const cv = formData.get("cv");
  let cvData: Buffer | null = null;
  let cvType: ReturnType<typeof detectCvType> = null;
  if (!(cv instanceof File) || cv.size === 0) errors.cv = ["Unggah CV (PDF atau DOCX)."];
  else if (cv.size > MAX_CV_BYTES) errors.cv = ["Ukuran CV maksimal 5 MB."];
  else {
    cvData = Buffer.from(await cv.arrayBuffer());
    cvType = detectCvType(cvData);
    if (!cvType) errors.cv = ["Format CV harus PDF atau DOCX."];
  }
  if (!parsed.success || errors.cv) return failed(formData, errors, errors.cv ? undefined : "Pilih ulang file CV sebelum mengirim lagi.");
  const d = parsed.data;

  const existing = await db.candidate.findUnique({ where: { email: d.email }, select: { id: true, anonymizedAt: true } });
  if (existing && !existing.anonymizedAt) {
    return failed(formData, { email: [`Email ini sudah ada di bank data (ID ${existing.id}). Buka profilnya untuk memasukkan ke lowongan.`] });
  }

  const job = d.jobId ? await db.job.findFirst({ where: { id: d.jobId, status: "OPEN" }, select: { id: true } }) : null;
  if (d.jobId && !job) return failed(formData, { jobId: ["Lowongan tidak ditemukan atau sudah ditutup."] });

  const fileKey = await saveFile("cv", cvData!, cvType!.ext);
  const resume = { fileKey, fileName: (cv as File).name.slice(0, 200), mimeType: cvType!.mime, sizeBytes: cvData!.length };

  let candidateId: string;
  let applicationId: string | null = null;
  try {
    const now = new Date();
    const result = await db.$transaction(async (tx) => {
      const candidate = await tx.candidate.create({
        data: {
          fullName: d.fullName,
          email: d.email,
          phone: d.phone,
          city: d.city,
          lastEducation: d.lastEducation,
          source: d.source,
          consentAt: now,
          consentVersion: PRIVACY_NOTICE_VERSION,
          consentMethod: "HR_ATTESTED",
          consentEvidence: d.consentEvidence,
          consentRecordedById: user.id,
          talentPoolConsent: d.talentPool,
          retainUntil: retainUntil(d.talentPool, now),
          // With a job the CV hangs off the application; without one, off the candidate
          ...(job ? {} : { resumes: { create: resume } }),
        },
        select: { id: true },
      });
      const app = job
        ? await tx.application.create({
            data: { candidateId: candidate.id, jobId: job.id, source: d.source, resumes: { create: resume } },
            select: { id: true },
          })
        : null;
      return { candidateId: candidate.id, applicationId: app?.id ?? null };
    });
    candidateId = result.candidateId;
    applicationId = result.applicationId;
  } catch (error) {
    await deleteFile(fileKey);
    console.error("addCandidate failed", error);
    return failed(formData, undefined, "Gagal menyimpan kandidat. Coba lagi.");
  }

  await writeAudit({
    actorId: user.id,
    action: "candidate.added_by_hr",
    entityType: "Candidate",
    entityId: candidateId,
    changes: { source: d.source, jobId: job?.id ?? null, talentPool: d.talentPool, consentVersion: PRIVACY_NOTICE_VERSION },
  });
  if (applicationId) scheduleScreening(applicationId);
  redirect(`/dashboard/kandidat/bank/${candidateId}?baru=1`);
}

// Bulk-adds candidates from the Excel template. All rows must be valid or nothing is
// saved; emails already in the bank are skipped. Consent is HR-attested per row.
export async function importCandidates(_state: ImportState, formData: FormData): Promise<ImportState> {
  const user = await requireRole("ADMIN", "HR");
  const attempt = Date.now();

  if (formData.get("consentConfirmed") !== "on") {
    return { message: "Centang pernyataan bahwa semua kandidat di file sudah menyetujui datanya disimpan.", attempt };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "Pilih file Excel (.xlsx).", attempt };
  if (file.size > MAX_IMPORT_BYTES) return { message: "Ukuran file maksimal 2 MB.", attempt };

  const parsed = await parseImportFile(Buffer.from(await file.arrayBuffer()));
  if (!parsed.ok) return { message: parsed.message, issues: parsed.issues, attempt };

  const existing = await db.candidate.findMany({
    where: { email: { in: parsed.rows.map((r) => r.email) } },
    select: { email: true },
  });
  const known = new Set(existing.map((c) => c.email));
  const fresh = parsed.rows.filter((r) => !known.has(r.email));

  const now = new Date();
  // One insert per row inside a transaction (MySQL/MariaDB has no createManyAndReturn)
  const created = await db.$transaction(
    async (tx) => {
      const rows = [];
      for (const r of fresh) {
        rows.push(
          await tx.candidate.create({
            data: {
              fullName: r.fullName,
              email: r.email,
              phone: r.phone,
              city: r.city,
              lastEducation: r.lastEducation,
              source: r.source,
              consentAt: now,
              consentVersion: PRIVACY_NOTICE_VERSION,
              consentMethod: "HR_ATTESTED",
              consentEvidence: r.consentEvidence,
              consentRecordedById: user.id,
              talentPoolConsent: r.talentPool,
              retainUntil: retainUntil(r.talentPool, now),
            },
            select: { id: true, source: true, talentPoolConsent: true },
          }),
        );
      }
      return rows;
    },
    { timeout: 120_000 },
  );

  for (const c of created) {
    await writeAudit({
      actorId: user.id,
      action: "candidate.imported_by_hr",
      entityType: "Candidate",
      entityId: c.id,
      changes: { source: c.source, talentPool: c.talentPoolConsent, consentVersion: PRIVACY_NOTICE_VERSION, file: file.name.slice(0, 200) },
    });
  }
  redirect(`/dashboard/kandidat/bank?impor=${created.length}&lewati=${known.size}`);
}

// Adds or replaces the CV kept on a bank candidate (e.g. after an import without CVs)
export async function uploadCandidateCv(candidateId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN", "HR");
  const candidate = await db.candidate.findUnique({ where: { id: candidateId }, select: { anonymizedAt: true } });
  if (!candidate || candidate.anonymizedAt) return { message: "Kandidat tidak ditemukan." };

  const cv = formData.get("cv");
  if (!(cv instanceof File) || cv.size === 0) return failed(formData, { cv: ["Pilih file CV (PDF atau DOCX)."] });
  if (cv.size > MAX_CV_BYTES) return failed(formData, { cv: ["Ukuran CV maksimal 5 MB."] });
  const data = Buffer.from(await cv.arrayBuffer());
  const type = detectCvType(data);
  if (!type) return failed(formData, { cv: ["Format CV harus PDF atau DOCX."] });

  const fileKey = await saveFile("cv", data, type.ext);
  try {
    await db.resume.create({
      data: { candidateId, fileKey, fileName: cv.name.slice(0, 200), mimeType: type.mime, sizeBytes: data.length },
    });
  } catch (error) {
    await deleteFile(fileKey);
    console.error("uploadCandidateCv failed", error);
    return failed(formData, undefined, "Gagal menyimpan CV. Coba lagi.");
  }
  await writeAudit({ actorId: user.id, action: "candidate.cv_uploaded", entityType: "Candidate", entityId: candidateId });
  refresh();
  return { ok: true, message: "CV tersimpan.", attempt: Date.now() };
}

// Puts a bank-data candidate into an open job, reusing their latest CV
export async function attachToJob(candidateId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN", "HR");
  const jobId = String(formData.get("jobId") ?? "");

  const [candidate, job] = await Promise.all([
    db.candidate.findUnique({ where: { id: candidateId }, select: { anonymizedAt: true, source: true } }),
    db.job.findFirst({ where: { id: jobId, status: "OPEN" }, select: { id: true, title: true } }),
  ]);
  if (!candidate || candidate.anonymizedAt) return { message: "Kandidat tidak ditemukan." };
  if (!job) return failed(formData, { jobId: ["Pilih lowongan yang sedang dibuka."] });

  const already = await db.application.findUnique({
    where: { candidateId_jobId: { candidateId, jobId } },
    select: { id: true },
  });
  if (already) return failed(formData, { jobId: ["Kandidat sudah ada di lowongan ini."] });

  const latestCv = await db.resume.findFirst({
    where: { OR: [{ candidateId }, { application: { candidateId } }] },
    orderBy: { uploadedAt: "desc" },
    select: { fileKey: true, fileName: true, mimeType: true, sizeBytes: true, extractedText: true },
  });
  if (!latestCv) return { message: "Kandidat ini belum punya CV." };

  const app = await db.application.create({
    data: {
      candidateId,
      jobId,
      source: "bank_data",
      // Same stored file; the new row lets screening and downloads work per application
      resumes: { create: latestCv },
    },
    select: { id: true },
  });
  await writeAudit({
    actorId: user.id,
    action: "candidate.attached_to_job",
    entityType: "Application",
    entityId: app.id,
    changes: { candidateId, jobId },
  });
  scheduleScreening(app.id);
  redirect(`/dashboard/kandidat/${app.id}`);
}
