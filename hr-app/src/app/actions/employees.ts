"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { failed, type FormState } from "@/lib/forms";
import { parseDateOnly } from "@/lib/labels";
import { EmploymentType } from "@/generated/prisma/enums";

const dateField = (error: string) =>
  z.string().transform((v, ctx) => {
    const d = parseDateOnly(v);
    if (!d) {
      ctx.addIssue({ code: "custom", message: error });
      return z.NEVER;
    }
    return d;
  });

const HireSchema = z
  .object({
    employeeNumber: z.string().trim().min(1, { error: "Isi nomor induk karyawan." }).max(30),
    departmentId: z.string().min(1, { error: "Pilih departemen." }),
    position: z.string().trim().min(2, { error: "Isi jabatan." }).max(120),
    employmentType: z.enum(EmploymentType),
    joinDate: dateField("Isi tanggal mulai bekerja."),
    endDate: z.preprocess((v) => (v === "" ? undefined : v), dateField("Tanggal tidak valid.").optional()),
    contractNumber: z.string().trim().min(1, { error: "Isi nomor kontrak." }).max(60),
  })
  .refine((d) => d.employmentType !== "PKWT" || d.endDate, {
    path: ["endDate"],
    error: "Kontrak PKWT wajib punya tanggal berakhir.",
  })
  .refine((d) => !d.endDate || d.endDate > d.joinDate, {
    path: ["endDate"],
    error: "Tanggal berakhir harus setelah tanggal mulai.",
  });

export async function hireCandidate(applicationId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN", "HR");

  const parsed = HireSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);
  const data = parsed.data;

  const app = await db.application.findUnique({
    where: { id: applicationId },
    select: {
      stage: true,
      employee: { select: { id: true } },
      candidate: { select: { fullName: true, email: true, phone: true, anonymizedAt: true } },
    },
  });
  if (!app || app.candidate.anonymizedAt) return failed(formData, undefined, "Lamaran tidak ditemukan.");
  if (app.stage !== "HIRED") return failed(formData, undefined, "Ubah tahap lamaran ke Diterima terlebih dahulu.");
  if (app.employee) return failed(formData, undefined, "Kandidat ini sudah dibuatkan data karyawan.");

  const [numberTaken, emailTaken, contractTaken, dept] = await Promise.all([
    db.employee.findUnique({ where: { employeeNumber: data.employeeNumber }, select: { id: true } }),
    db.employee.findUnique({ where: { email: app.candidate.email }, select: { id: true } }),
    db.contract.findUnique({ where: { contractNumber: data.contractNumber }, select: { id: true } }),
    db.department.findUnique({ where: { id: data.departmentId }, select: { id: true } }),
  ]);
  const errors: Record<string, string[]> = {};
  if (numberTaken) errors.employeeNumber = ["Nomor induk ini sudah dipakai."];
  if (contractTaken) errors.contractNumber = ["Nomor kontrak ini sudah dipakai."];
  if (!dept) errors.departmentId = ["Departemen tidak ditemukan."];
  if (Object.keys(errors).length) return failed(formData, errors);
  if (emailTaken) return failed(formData, undefined, `Sudah ada karyawan dengan email ${app.candidate.email}.`);

  const employee = await db.$transaction(async (tx) => {
    const emp = await tx.employee.create({
      data: {
        employeeNumber: data.employeeNumber,
        applicationId,
        fullName: app.candidate.fullName,
        email: app.candidate.email,
        phone: app.candidate.phone,
        departmentId: data.departmentId,
        position: data.position,
        employmentType: data.employmentType,
        // PKWT may not include a probation period (UU 13/2003 Pasal 58), so only PKWTT starts on probation
        status: data.employmentType === "PKWTT" ? "PROBATION" : "ACTIVE",
        joinDate: data.joinDate,
        endDate: data.endDate,
      },
      select: { id: true },
    });
    await tx.contract.create({
      data: {
        employeeId: emp.id,
        type: data.employmentType,
        contractNumber: data.contractNumber,
        position: data.position,
        startDate: data.joinDate,
        endDate: data.endDate,
      },
    });
    return emp;
  });

  await writeAudit({
    actorId: user.id,
    action: "employee.created",
    entityType: "Employee",
    entityId: employee.id,
    changes: { applicationId, employeeNumber: data.employeeNumber, employmentType: data.employmentType },
  });
  redirect("/dashboard/karyawan");
}
