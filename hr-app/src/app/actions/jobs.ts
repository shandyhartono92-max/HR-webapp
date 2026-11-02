"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { findOrCreateDepartment } from "@/lib/departments";
import { checkbox, failed, optionalInt, optionalText, type FormState } from "@/lib/forms";
import { EmploymentType, JobStatus } from "@/generated/prisma/enums";

const JobSchema = z
  .object({
    title: z.string().trim().min(3, { error: "Judul minimal 3 karakter." }).max(120),
    departmentName: z.string().trim().min(2, { error: "Departemen wajib diisi." }).max(80),
    hiringManagerName: z.string().trim().min(2, { error: "Hiring manager wajib diisi." }).max(120),
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

// Department and hiring manager are typed freely. A department name that does not
// exist yet is created (ignoring case, so "it" reuses "IT"). A manager name that
// matches an active staff account is linked to it, so that person can see the
// job's candidates; any other name is kept as text only.
async function resolveReferences(departmentName: string, hiringManagerName: string) {
  const [dept, manager] = await Promise.all([
    findOrCreateDepartment(departmentName),
    db.user.findFirst({
      where: {
        name: { equals: hiringManagerName, mode: "insensitive" },
        isActive: true,
        role: { in: ["ADMIN", "HR", "HIRING_MANAGER"] },
      },
      select: { id: true, name: true },
    }),
  ]);
  return {
    departmentId: dept.id,
    hiringManagerId: manager?.id ?? null,
    hiringManagerName: manager?.name ?? hiringManagerName,
  };
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
  const { departmentName, hiringManagerName, ...data } = parsed.data;
  const refs = await resolveReferences(departmentName, hiringManagerName);

  const job = await db.job.create({
    data: {
      ...data,
      ...refs,
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
  const { departmentName, hiringManagerName, ...data } = parsed.data;
  const refs = await resolveReferences(departmentName, hiringManagerName);

  await db.job.update({
    where: { id: jobId },
    data: {
      ...data,
      ...refs,
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
