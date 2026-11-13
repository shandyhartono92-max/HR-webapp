"use server";

import { after } from "next/server";
import * as z from "zod";
import { siteDb } from "@/lib/db";
import { siteByCode } from "@/lib/sites";
import { withSite } from "@/lib/site-context";
import { writeAudit } from "@/lib/audit";
import { checkbox, failed, optionalInt, optionalText, type FormState } from "@/lib/forms";
import { applicationSources, educationLevels } from "@/lib/labels";
import { MAX_CV_BYTES, PRIVACY_NOTICE_VERSION, retainUntil } from "@/lib/privacy";
import { screenApplication, isScreeningConfigured } from "@/lib/screening";
import { deleteFile, detectCvType, saveFile } from "@/lib/storage";

const ApplySchema = z.object({
  jobId: z.string().min(1),
  fullName: z.string().trim().min(3, { error: "Nama lengkap minimal 3 karakter." }).max(120),
  email: z.email({ error: "Masukkan email yang valid." }).trim().toLowerCase(),
  phone: z
    .string()
    .transform((v) => v.replace(/[\s.-]/g, ""))
    .pipe(z.string().regex(/^(\+62|62|0)8\d{7,12}$/, { error: "Masukkan nomor HP Indonesia, misal 0812xxxxxxx." })),
  city: optionalText(80),
  lastEducation: z.enum(educationLevels, { error: "Pilih pendidikan terakhir." }),
  expectedSalary: optionalInt(0, 1_000_000_000, "Isi angka tanpa titik, misal 7000000."),
  noticePeriodDays: optionalInt(0, 365, "Isi jumlah hari, 0–365."),
  source: z.preprocess((v) => (v === "" ? undefined : v), z.enum(Object.keys(applicationSources) as [string, ...string[]]).optional()),
  consent: z.literal("on", { error: "Anda perlu menyetujui pemberitahuan privasi untuk melamar." }),
  talentPool: checkbox,
});

// The careers page has no session: the location comes from the job's address
// (/karir/<location>/<slug>), so the application lands in that location's database
export async function applyForJob(state: FormState, formData: FormData): Promise<FormState> {
  const site = siteByCode(formData.get("site"));
  if (!site) return { message: "Lowongan ini tidak ditemukan. Buka lagi dari halaman Karir.", attempt: Date.now() };
  return withSite(site.code, () => applyAt(state, formData));
}

async function applyAt(_state: FormState, formData: FormData): Promise<FormState> {
  const db = await siteDb();
  // Honeypot: real people never fill this hidden field
  if (formData.get("website")) return { ok: true };

  const parsed = ApplySchema.safeParse(Object.fromEntries(formData));
  const errors: Record<string, string[] | undefined> = parsed.success ? {} : z.flattenError(parsed.error).fieldErrors;

  const cv = formData.get("cv");
  let cvData: Buffer | null = null;
  let cvType: ReturnType<typeof detectCvType> = null;
  if (!(cv instanceof File) || cv.size === 0) {
    errors.cv = ["Unggah CV Anda (PDF atau DOCX)."];
  } else if (cv.size > MAX_CV_BYTES) {
    errors.cv = ["Ukuran CV maksimal 5 MB."];
  } else {
    cvData = Buffer.from(await cv.arrayBuffer());
    cvType = detectCvType(cvData);
    if (!cvType) errors.cv = ["Format CV harus PDF atau DOCX."];
  }

  if (!parsed.success || errors.cv) return failed(formData, errors);
  const data = parsed.data;

  const job = await db.job.findFirst({ where: { id: data.jobId, status: "OPEN" }, select: { id: true } });
  if (!job) return failed(formData, undefined, "Lowongan ini sudah ditutup.");

  const existing = await db.application.findFirst({
    where: { jobId: job.id, candidate: { email: data.email } },
    select: { id: true },
  });
  if (existing) {
    return failed(formData, undefined, "Anda sudah pernah melamar posisi ini dengan email tersebut.");
  }

  const fileKey = await saveFile("cv", cvData!, cvType!.ext);
  try {
    const now = new Date();
    const application = await db.$transaction(async (tx) => {
      const prev = await tx.candidate.findUnique({ where: { email: data.email }, select: { retainUntil: true } });
      const newRetention = retainUntil(data.talentPool, now);
      const candidateData = {
        fullName: data.fullName,
        phone: data.phone,
        city: data.city,
        lastEducation: data.lastEducation,
        consentAt: now,
        consentVersion: PRIVACY_NOTICE_VERSION,
        talentPoolConsent: data.talentPool,
        // Never shorten a retention date that is already later
        retainUntil: prev && prev.retainUntil > newRetention ? prev.retainUntil : newRetention,
      };
      const candidate = await tx.candidate.upsert({
        where: { email: data.email },
        update: candidateData,
        create: { email: data.email, ...candidateData },
        select: { id: true },
      });

      return tx.application.create({
        data: {
          candidateId: candidate.id,
          jobId: job.id,
          expectedSalary: data.expectedSalary,
          noticePeriodDays: data.noticePeriodDays,
          source: data.source,
          resumes: {
            create: {
              fileKey,
              fileName: (cv as File).name.slice(0, 200),
              mimeType: cvType!.mime,
              sizeBytes: cvData!.length,
            },
          },
        },
        select: { id: true },
      });
    });

    await writeAudit({
      actorId: null,
      action: "application.submitted",
      entityType: "Application",
      entityId: application.id,
      changes: { jobId: job.id, consentVersion: PRIVACY_NOTICE_VERSION, talentPool: data.talentPool },
    });

    // Score the CV after the response is sent, so the applicant doesn't wait.
    // Failures are logged; HR can re-run it from the candidate page.
    if (isScreeningConfigured()) {
      after(async () => {
        const result = await screenApplication(application.id);
        if (!result.ok) console.error("Auto-screening failed", application.id, result.error);
      });
    }
  } catch (error) {
    await deleteFile(fileKey);
    console.error("applyForJob failed", error);
    return failed(formData, undefined, "Maaf, lamaran gagal dikirim. Silakan coba lagi.");
  }

  return { ok: true };
}
