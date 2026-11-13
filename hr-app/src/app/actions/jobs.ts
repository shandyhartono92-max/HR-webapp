"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import { siteDb } from "@/lib/db";
import { formSiteRefusal } from "@/lib/form-site";
import { requireRole } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { findOrCreateDepartment } from "@/lib/departments";
import { equalsIgnoringCase } from "@/lib/match";
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

const staff = { isActive: true, role: { in: ["ADMIN" as const, "HR" as const, "HIRING_MANAGER" as const] } };

type Linked = { id: string | null; name: string };

// Hiring manager is typed freely. It is linked to an active staff account (giving that
// person access to the job's candidates) when the text matches the account's email, or
// its name if exactly one account has that name. Any other text is kept as a name only.
async function resolveManager(typed: string, current?: Linked): Promise<{ manager: Linked } | { error: string }> {
  const db = await siteDb();
  // Unchanged on edit: keep the link even if the account was renamed since
  if (current?.id && typed.toLowerCase() === current.name.toLowerCase()) {
    const user = await db.user.findFirst({ where: { id: current.id, ...staff }, select: { id: true, name: true } });
    if (user) return { manager: user };
  }
  const matches = await db.user.findMany({
    where: { ...staff, OR: [{ email: equalsIgnoringCase(typed) }, { name: equalsIgnoringCase(typed) }] },
    select: { id: true, name: true, email: true },
  });
  const byEmail = matches.find((u) => u.email.toLowerCase() === typed.toLowerCase());
  if (byEmail) return { manager: { id: byEmail.id, name: byEmail.name } };
  if (matches.length > 1) {
    return { error: `Ada ${matches.length} akun bernama "${typed}". Ketik email akunnya untuk memilih: ${matches.map((u) => u.email).join(", ")}.` };
  }
  return { manager: matches[0] ? { id: matches[0].id, name: matches[0].name } : { id: null, name: typed } };
}

// Department is typed freely; a new name is created (ignoring case, so "it" reuses "IT")
async function resolveReferences(departmentName: string, hiringManagerName: string, current?: Linked) {
  const resolved = await resolveManager(hiringManagerName, current);
  if ("error" in resolved) return resolved;
  const dept = await findOrCreateDepartment(departmentName);
  return {
    refs: { departmentId: dept.id, hiringManagerId: resolved.manager.id, hiringManagerName: resolved.manager.name },
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
  const db = await siteDb();
  const base = slugify(title);
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const taken = await db.job.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) return slug;
  }
}

export async function createJob(_state: FormState, formData: FormData): Promise<FormState> {
  const db = await siteDb();
  const user = await requireRole("ADMIN", "HR");
  const moved = await formSiteRefusal(formData);
  if (moved) return { message: moved, attempt: Date.now() };

  const parsed = parse(formData);
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);
  const { departmentName, hiringManagerName, ...data } = parsed.data;
  const resolved = await resolveReferences(departmentName, hiringManagerName);
  if ("error" in resolved) return failed(formData, { hiringManagerName: [resolved.error] });

  const job = await db.job.create({
    data: {
      ...data,
      ...resolved.refs,
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
  const db = await siteDb();
  const user = await requireRole("ADMIN", "HR");

  const existing = await db.job.findUnique({
    where: { id: jobId },
    select: { status: true, openedAt: true, title: true, hiringManagerId: true, hiringManagerName: true },
  });
  if (!existing) return failed(formData, undefined, "Lowongan tidak ditemukan.");

  const parsed = parse(formData);
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);
  const { departmentName, hiringManagerName, ...data } = parsed.data;
  const resolved = await resolveReferences(departmentName, hiringManagerName, {
    id: existing.hiringManagerId,
    name: existing.hiringManagerName,
  });
  if ("error" in resolved) return failed(formData, { hiringManagerName: [resolved.error] });

  await db.job.update({
    where: { id: jobId },
    data: {
      ...data,
      ...resolved.refs,
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
