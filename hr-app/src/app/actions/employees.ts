"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { failed, optionalDate, type FormState } from "@/lib/forms";
import { encrypt, lastFour } from "@/lib/crypto";
import { parseNewEmployee, SENSITIVE_FIELDS } from "@/lib/new-employee";
import { parseDateOnly, todayDate } from "@/lib/labels";
import { ENDED_FIRST_CONTRACT_MESSAGE, endedContractError } from "@/lib/contract-end";
import { trainingErrors } from "@/lib/training";
import { checkWorkLocation, warehouseFor, workLocationFields } from "@/lib/work-location";
import { EmploymentType } from "@/generated/prisma/enums";
import { findOrCreateDepartment } from "@/lib/departments";
import { endedContractIssues, MAX_EMPLOYEE_IMPORT_BYTES, parseEmployeeFile } from "@/lib/employee-import";
import type { ImportState, RowIssue } from "@/lib/excel";
import { anyEqualsIgnoringCase, equalsIgnoringCase } from "@/lib/match";

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
    employeeNumber: z.string().trim().min(1, { error: "Isi Employee ID." }).max(30),
    trainingStart: optionalDate,
    trainingEnd: optionalDate,
    departmentId: z.string().min(1, { error: "Pilih departemen." }),
    position: z.string().trim().min(2, { error: "Isi jabatan." }).max(120),
    ...workLocationFields,
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
  })
  // A first contract: there is no extension to point to, so the shorter message
  .refine((d) => !endedContractError(d.endDate, todayDate()), { path: ["endDate"], error: ENDED_FIRST_CONTRACT_MESSAGE })
  .superRefine(checkWorkLocation({ required: true }));

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

  // All comparisons ignore case, as the file check does: "uji-001" is the same as "UJI-001"
  const lower = (s: string) => s.toLowerCase();
  const existing = await db.employee.findMany({
    where: anyEqualsIgnoringCase("employeeNumber", parsed.rows.map((r) => r.employeeNumber)),
    select: { employeeNumber: true },
  });
  const known = new Set(existing.map((e) => lower(e.employeeNumber)));
  const fresh = parsed.rows.filter((r) => !known.has(lower(r.employeeNumber)));
  // A former trainee number (T001) is never handed out again
  const usedForTraining = new Set(
    fresh.length
      ? (
          await db.employee.findMany({
            where: anyEqualsIgnoringCase("traineeNumber", fresh.map((r) => r.employeeNumber)),
            select: { traineeNumber: true },
          })
        ).map((e) => lower(e.traineeNumber!))
      : [],
  );

  // Emails and contract numbers must not clash with other records already in the portal
  const [emailsTaken, contractsTaken] = await Promise.all([
    fresh.length
      ? db.employee.findMany({ where: anyEqualsIgnoringCase("email", fresh.map((r) => r.email)), select: { email: true, employeeNumber: true } })
      : [],
    fresh.length
      ? db.contract.findMany({ where: anyEqualsIgnoringCase("contractNumber", fresh.map((r) => r.contractNumber)), select: { contractNumber: true } })
      : [],
  ]);
  const emailOwner = new Map(emailsTaken.map((e) => [lower(e.email), e.employeeNumber]));
  const contractSet = new Set(contractsTaken.map((c) => lower(c.contractNumber)));
  // Checked only for rows that will be created, never for skipped ones (see endedContractIssues)
  const ended = new Map(endedContractIssues(fresh, todayDate()).map((i) => [i.rowNumber, i.messages]));
  const issues: RowIssue[] = [];
  let clashes = 0;
  for (const r of fresh) {
    const clash = [
      emailOwner.has(lower(r.email)) && `Email: sudah dipakai karyawan ${emailOwner.get(lower(r.email))}.`,
      contractSet.has(lower(r.contractNumber)) && `No. kontrak: ${r.contractNumber} sudah ada.`,
      usedForTraining.has(lower(r.employeeNumber)) && `Employee ID: ${r.employeeNumber} sudah pernah dipakai sebagai ID training.`,
    ].filter(Boolean) as string[];
    if (clash.length) clashes++;
    const messages = [...(ended.get(r.rowNumber) ?? []), ...clash];
    if (messages.length) issues.push({ rowNumber: r.rowNumber, name: r.fullName, messages });
  }
  if (issues.length) {
    // "bentrok" only when every listed row clashes with saved data; an ended contract is a fix in the file
    const summary = clashes === issues.length ? "bentrok dengan data yang sudah ada" : "perlu diperbaiki";
    return { message: `${issues.length} baris ${summary}. Belum ada data yang disimpan.`, issues, attempt };
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
            workLocation: r.workLocation,
            warehouse: r.warehouse,
            employmentType: r.employmentType,
            status: r.status ?? "ACTIVE",
            joinDate: r.joinDate,
            endDate: r.endDate,
            birthPlace: r.birthPlace,
            birthDate: r.birthDate,
            gender: r.gender,
            trainingStart: r.trainingStart,
            trainingEnd: r.trainingEnd,
            motherMaidenName: r.motherMaidenName,
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
  const training = trainingErrors(data, todayDate());
  if (Object.keys(training).length) return failed(formData, training);

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
    // A former trainee number (T001) is never handed out again
    db.employee.findFirst({
      where: { OR: [{ employeeNumber: equalsIgnoringCase(data.employeeNumber) }, { traineeNumber: equalsIgnoringCase(data.employeeNumber) }] },
      select: { id: true },
    }),
    db.employee.findFirst({ where: { email: equalsIgnoringCase(app.candidate.email) }, select: { id: true } }),
    db.contract.findFirst({ where: { contractNumber: equalsIgnoringCase(data.contractNumber) }, select: { id: true } }),
    db.department.findUnique({ where: { id: data.departmentId }, select: { id: true } }),
  ]);
  const errors: Record<string, string[]> = {};
  if (numberTaken) errors.employeeNumber = ["Employee ID ini sudah dipakai, atau pernah dipakai sebagai ID training."];
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
        workLocation: data.workLocation,
        warehouse: warehouseFor(data.workLocation, data.warehouse),
        employmentType: data.employmentType,
        // PKWT may not include a probation period (UU 13/2003 Pasal 58), so only PKWTT starts on probation
        status: data.employmentType === "PKWTT" ? "PROBATION" : "ACTIVE",
        joinDate: data.joinDate,
        endDate: data.endDate,
        trainingStart: data.trainingStart,
        trainingEnd: data.trainingEnd,
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

// The database's "unique constraint failed" error (Prisma code P2002)
const isUniqueClash = (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2002";

// One employee who did not come through recruitment (moved in, hired outside the
// portal). Same rules as the import and the profile forms; the bank account is left
// out on purpose: it needs a second HR/Admin's approval, from the profile.
export async function createEmployee(_state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN", "HR");

  // Identity numbers are never sent back to refill the form, even after an error
  const safeValues = new FormData();
  for (const [k, v] of formData) if (!(SENSITIVE_FIELDS as readonly string[]).includes(k)) safeValues.append(k, v);
  const typedSensitive = SENSITIVE_FIELDS.some((k) => String(formData.get(k) ?? "").trim());
  const retype = typedSensitive ? " NIK, NPWP dan BPJS perlu diketik ulang." : "";

  const parsed = parseNewEmployee(Object.fromEntries(formData), todayDate());
  if (!parsed.ok) return failed(safeValues, parsed.errors, `Periksa kembali isian yang ditandai.${retype}`);
  const data = parsed.data;

  const [numberTaken, emailTaken, contractTaken, dept] = await Promise.all([
    // A former trainee number (T001) is never handed out again
    db.employee.findFirst({
      where: { OR: [{ employeeNumber: equalsIgnoringCase(data.employeeNumber) }, { traineeNumber: equalsIgnoringCase(data.employeeNumber) }] },
      select: { id: true },
    }),
    db.employee.findFirst({ where: { email: equalsIgnoringCase(data.email) }, select: { employeeNumber: true } }),
    db.contract.findFirst({ where: { contractNumber: equalsIgnoringCase(data.contractNumber) }, select: { id: true } }),
    db.department.findUnique({ where: { id: data.departmentId }, select: { id: true } }),
  ]);
  const errors: Record<string, string[]> = {};
  if (numberTaken) errors.employeeNumber = ["Employee ID ini sudah dipakai, atau pernah dipakai sebagai ID training."];
  if (emailTaken) errors.email = [`Email ini sudah dipakai karyawan ${emailTaken.employeeNumber}.`];
  // A blank contract number becomes <Employee ID>/MANUAL: when the ID itself is taken,
  // that number is too, and the error belongs on the ID only, not on the empty field
  if (contractTaken && !data.contractNumberAuto) errors.contractNumber = ["Nomor kontrak ini sudah dipakai."];
  if (contractTaken && data.contractNumberAuto && !numberTaken) {
    errors.contractNumber = [`Nomor kontrak otomatis ${data.contractNumber} sudah dipakai. Isi nomor kontrak lain.`];
  }
  if (!dept) errors.departmentId = ["Departemen tidak ditemukan."];
  if (Object.keys(errors).length) return failed(safeValues, errors, `Periksa kembali isian yang ditandai.${retype}`);

  const enc = (v: string | undefined) => (v ? { enc: encrypt(v), last4: lastFour(v) } : null);
  const [nik, npwp, kes, tk] = [enc(data.nik), enc(data.npwp), enc(data.bpjsKesehatan), enc(data.bpjsKetenagakerjaan)];

  let employee: { id: string };
  try {
    employee = await db.employee.create({
      data: {
        employeeNumber: data.employeeNumber,
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        departmentId: data.departmentId,
        position: data.position,
        workLocation: data.workLocation,
        warehouse: data.warehouse,
        employmentType: data.employmentType,
        status: data.status,
        joinDate: data.joinDate,
        endDate: data.endDate,
        trainingStart: data.trainingStart,
        trainingEnd: data.trainingEnd,
        birthPlace: data.birthPlace,
        birthDate: data.birthDate,
        gender: data.gender,
        address: data.address,
        motherMaidenName: data.motherMaidenName,
        ptkpStatus: data.ptkpStatus,
        nikKtpEnc: nik?.enc,
        nikKtpLast4: nik?.last4,
        npwpEnc: npwp?.enc,
        npwpLast4: npwp?.last4,
        bpjsKesehatanEnc: kes?.enc,
        bpjsKesehatanLast4: kes?.last4,
        bpjsKetenagakerjaanEnc: tk?.enc,
        bpjsKetenagakerjaanLast4: tk?.last4,
        contracts: {
          create: {
            type: data.employmentType,
            contractNumber: data.contractNumber,
            position: data.position,
            startDate: data.joinDate,
            endDate: data.endDate,
          },
        },
      },
      select: { id: true },
    });
  } catch (error) {
    // Someone saved the same Employee ID, email or contract number a moment ago
    if (isUniqueClash(error)) {
      return failed(safeValues, undefined, `Employee ID, email atau nomor kontrak baru saja dipakai data lain. Periksa lagi.${retype}`);
    }
    throw error;
  }

  // Which fields were filled in, never their values
  const filled = Object.entries(data)
    .filter(([k, v]) => k !== "contractNumberAuto" && v !== null && v !== undefined && v !== "")
    .map(([k]) => k);
  await writeAudit({
    actorId: user.id,
    action: "employee.created_manual",
    entityType: "Employee",
    entityId: employee.id,
    changes: { employeeNumber: data.employeeNumber, employmentType: data.employmentType, fields: filled },
  });
  // The menu badge for ending contracts lives in the dashboard layout
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/karyawan/${employee.id}?ditambah=1`);
}
