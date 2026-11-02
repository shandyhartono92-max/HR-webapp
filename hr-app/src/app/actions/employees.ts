"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { failed, type FormState } from "@/lib/forms";
import { parseDateOnly } from "@/lib/labels";
import { EmploymentType } from "@/generated/prisma/enums";
import { findOrCreateDepartment } from "@/lib/departments";
import { MAX_EMPLOYEE_IMPORT_BYTES, parseEmployeeFile } from "@/lib/employee-import";
import type { ImportState, RowIssue } from "@/lib/excel";

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

// Bulk-adds existing employees with their current contract from the Excel template.
// All rows must be valid or nothing is saved; employee numbers already in the
// portal are skipped so the same file can be uploaded again.
export async function importEmployees(_state: ImportState, formData: FormData): Promise<ImportState> {
  const user = await requireRole("ADMIN", "HR");
  const attempt = Date.now();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "Pilih file Excel (.xlsx).", attempt };
  if (file.size > MAX_EMPLOYEE_IMPORT_BYTES) return { message: "Ukuran file maksimal 2 MB.", attempt };

  const parsed = await parseEmployeeFile(Buffer.from(await file.arrayBuffer()));
  if (!parsed.ok) return { message: parsed.message, issues: parsed.issues, attempt };

  const existing = await db.employee.findMany({
    where: { employeeNumber: { in: parsed.rows.map((r) => r.employeeNumber) } },
    select: { employeeNumber: true },
  });
  const known = new Set(existing.map((e) => e.employeeNumber));
  const fresh = parsed.rows.filter((r) => !known.has(r.employeeNumber));

  // Emails and contract numbers must not clash with other records already in the portal
  const [emailsTaken, contractsTaken] = await Promise.all([
    db.employee.findMany({ where: { email: { in: fresh.map((r) => r.email) } }, select: { email: true, employeeNumber: true } }),
    db.contract.findMany({ where: { contractNumber: { in: fresh.map((r) => r.contractNumber) } }, select: { contractNumber: true } }),
  ]);
  const emailOwner = new Map(emailsTaken.map((e) => [e.email, e.employeeNumber]));
  const contractSet = new Set(contractsTaken.map((c) => c.contractNumber));
  const issues: RowIssue[] = [];
  for (const r of fresh) {
    const messages = [
      emailOwner.has(r.email) && `Email: sudah dipakai karyawan ${emailOwner.get(r.email)}.`,
      contractSet.has(r.contractNumber) && `No. kontrak: ${r.contractNumber} sudah ada.`,
    ].filter(Boolean) as string[];
    if (messages.length) issues.push({ rowNumber: r.rowNumber, name: r.fullName, messages });
  }
  if (issues.length) {
    return { message: `${issues.length} baris bentrok dengan data yang sudah ada. Belum ada data yang disimpan.`, issues, attempt };
  }

  const created = await db.$transaction(
    async (tx) => {
      const deptIds = new Map<string, string>();
      const ids: { id: string; employeeNumber: string; employmentType: EmploymentType }[] = [];
      for (const r of fresh) {
        const deptKey = r.department.toLowerCase();
        if (!deptIds.has(deptKey)) deptIds.set(deptKey, (await findOrCreateDepartment(r.department, tx)).id);
        const emp = await tx.employee.create({
          data: {
            employeeNumber: r.employeeNumber,
            fullName: r.fullName,
            email: r.email,
            phone: r.phone,
            departmentId: deptIds.get(deptKey)!,
            position: r.position,
            employmentType: r.employmentType,
            status: r.status ?? "ACTIVE",
            joinDate: r.joinDate,
            endDate: r.endDate,
            birthPlace: r.birthPlace,
            birthDate: r.birthDate,
            gender: r.gender,
            contracts: {
              create: {
                type: r.employmentType,
                contractNumber: r.contractNumber,
                position: r.position,
                startDate: r.joinDate,
                endDate: r.endDate,
              },
            },
          },
          select: { id: true, employeeNumber: true, employmentType: true },
        });
        ids.push(emp);
      }
      return ids;
    },
    // Up to 500 rows, one insert at a time on the single-connection dev database
    { timeout: 120_000 },
  );

  for (const e of created) {
    await writeAudit({
      actorId: user.id,
      action: "employee.imported",
      entityType: "Employee",
      entityId: e.id,
      changes: { employeeNumber: e.employeeNumber, employmentType: e.employmentType, file: file.name.slice(0, 200) },
    });
  }
  // The menu badge for ending contracts lives in the dashboard layout
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/karyawan?impor=${created.length}&lewati=${known.size}`);
}

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
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/karyawan");
}
