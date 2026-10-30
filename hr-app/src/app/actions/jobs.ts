"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { checkbox, failed, optionalInt, optionalText, type FormState } from "@/lib/forms";
import { EmploymentType, JobStatus } from "@/generated/prisma/enums";

const JobSchema = z
  .object({
    title: z.string().trim().min(3, { error: "Judul minimal 3 karakter." }).max(120),
    departmentId: z.string().min(1, { error: "Pilih departemen." }),
    hiringManagerId: z.string().min(1, { error: "Pilih hiring manager." }),
    employmentType: z.enum(EmploymentType, { error: "Pilih jenis pekerjaan." }),
    location: z.string().trim().min(2, { error: "Lokasi wajib diisi." }).max(120),
    description: z.string().trim().min(20, { error: "Deskripsi minimal 20 karakter." }).max(5000),
    requirements: z.string().trim().min(20, { error: "Kualifikasi minimal 20 karakter." }).max(5000),
    minEducation: optionalText(20),
    minExperienceYears: optionalInt(0, 40, "Isi angka 0–40."),
    salaryMin: optionalInt(0, 1_000_000_000, "Isi angka tanpa titik, misal 6000000."),
    salaryMax: optionalInt(0, 1_000_000_000, "Isi angka tanpa titik, misal 8000000."),
    showSalary: checkbox,
    headcount: z.coerce.number({ error: "Isi angka 1–100." }).int().min(1, { error: "Minimal 1." }).max(100),
    status: z.enum(JobStatus),
  })
  .refine((d) => d.salaryMin === undefined || d.salaryMax === undefined || d.salaryMax >= d.salaryMin, {
    path: ["salaryMax"],
    error: "Gaji maksimum harus ≥ gaji minimum.",
  });

function parse(formData: FormData) {
  return JobSchema.safeParse(Object.fromEntries(formData));
}

// Hiring manager must be an active staff user
async function checkReferences(departmentId: string, hiringManagerId: string) {
  const [dept, manager] = await Promise.all([
    db.department.findUnique({ where: { id: departmentId }, select: { id: true } }),
    db.user.findFirst({
      where: { id: hiringManagerId, isActive: true, role: { in: ["ADMIN", "HR", "HIRING_MANAGER"] } },
      select: { id: true },
    }),
  ]);
  const errors: Record<string, string[]> = {};
  if (!dept) errors.departmentId = ["Departemen tidak ditemukan."];
  if (!manager) errors.hiringManagerId = ["Hiring manager tidak valid."];
  return Object.keys(errors).length ? errors : null;
}

function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "lowongan"
  );
}

async function uniqueSlug(title: string) {
  const base = slugify(title);
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const taken = await db.job.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) return slug;
  }
}

export async function createJob(_state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN", "HR");

  const parsed = parse(formData);
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);
  const data = parsed.data;

  const refErrors = await checkReferences(data.departmentId, data.hiringManagerId);
  if (refErrors) return failed(formData, refErrors);

  const job = await db.job.create({
    data: {
      ...data,
      slug: await uniqueSlug(data.title),
      openedAt: data.status === "OPEN" ? new Date() : null,
      closedAt: data.status === "CLOSED" ? new Date() : null,
    },
    select: { id: true },
  });

  await writeAudit({
    actorId: user.id,
    action: "job.created",
    entityType: "Job",
    entityId: job.id,
    changes: { title: data.title, status: data.status },
  });
  redirect("/dashboard/lowongan");
}

export async function updateJob(jobId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN", "HR");

  const existing = await db.job.findUnique({ where: { id: jobId }, select: { status: true, openedAt: true, title: true } });
  if (!existing) return failed(formData, undefined, "Lowongan tidak ditemukan.");

  const parsed = parse(formData);
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);
  const data = parsed.data;

  const refErrors = await checkReferences(data.departmentId, data.hiringManagerId);
  if (refErrors) return failed(formData, refErrors);

  await db.job.update({
    where: { id: jobId },
    data: {
      ...data,
      // The slug stays the same so links already shared keep working
      openedAt: data.status === "OPEN" && !existing.openedAt ? new Date() : undefined,
      closedAt: data.status === "CLOSED" ? (existing.status === "CLOSED" ? undefined : new Date()) : null,
    },
  });

  await writeAudit({
    actorId: user.id,
    action: "job.updated",
    entityType: "Job",
    entityId: jobId,
    changes: {
      before: { title: existing.title, status: existing.status },
      after: { title: data.title, status: data.status },
    },
  });
  redirect("/dashboard/lowongan");
}
