"use server";

import { refresh } from "next/cache";
import * as z from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { decrypt, encrypt, lastFour } from "@/lib/crypto";
import { failed, optionalText, type FormState } from "@/lib/forms";
import {
  bpjsKesehatanError,
  bpjsKetenagakerjaanError,
  digitsOnly,
  nikError,
  npwpError,
} from "@/lib/indonesia-id";
import { parseDateOnly } from "@/lib/labels";
import { EmployeeStatus, Gender, PtkpStatus } from "@/generated/prisma/enums";

const notFound: FormState = { message: "Data karyawan tidak ditemukan." };

// ── Employment details ──────────────────────────────────────

const EmploymentSchema = z.object({
  departmentId: z.string().min(1, { error: "Pilih departemen." }),
  position: z.string().trim().min(2, { error: "Isi jabatan." }).max(120),
  status: z.enum(EmployeeStatus),
  managerId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable()),
});

export async function updateEmployment(employeeId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN", "HR");

  const before = await db.employee.findUnique({
    where: { id: employeeId },
    select: { departmentId: true, position: true, status: true, managerId: true },
  });
  if (!before) return notFound;

  const parsed = EmploymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);
  const data = parsed.data;

  if (data.managerId === employeeId) return failed(formData, { managerId: ["Atasan tidak boleh diri sendiri."] });
  const [dept, manager] = await Promise.all([
    db.department.findUnique({ where: { id: data.departmentId }, select: { id: true } }),
    data.managerId ? db.employee.findUnique({ where: { id: data.managerId }, select: { id: true } }) : true,
  ]);
  if (!dept) return failed(formData, { departmentId: ["Departemen tidak ditemukan."] });
  if (!manager) return failed(formData, { managerId: ["Atasan tidak ditemukan."] });

  await db.employee.update({ where: { id: employeeId }, data });

  const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => data[k] !== before[k]);
  if (changed.length) {
    await writeAudit({
      actorId: user.id,
      action: "employee.employment_updated",
      entityType: "Employee",
      entityId: employeeId,
      changes: Object.fromEntries(changed.map((k) => [k, { from: before[k], to: data[k] }])),
    });
  }
  refresh();
  return { ok: true, attempt: Date.now() };
}

// ── Personal data ───────────────────────────────────────────

// Sensitive numbers: blank input means "keep the stored value"
const sensitiveInput = z.preprocess(
  (v) => (typeof v === "string" ? digitsOnly(v) : v),
  z.string().transform((v) => (v === "" ? undefined : v)),
);

const PersonalSchema = z.object({
  birthPlace: optionalText(80),
  birthDate: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .string()
      .transform((v, ctx) => {
        const d = parseDateOnly(v);
        if (!d) {
          ctx.addIssue({ code: "custom", message: "Tanggal lahir tidak valid." });
          return z.NEVER;
        }
        return d;
      })
      .optional(),
  ),
  gender: z.preprocess((v) => (v === "" ? undefined : v), z.enum(Gender).optional()),
  address: optionalText(500),
  ptkpStatus: z.preprocess((v) => (v === "" ? undefined : v), z.enum(PtkpStatus).optional()),
  nik: sensitiveInput,
  npwp: sensitiveInput,
  bpjsKesehatan: sensitiveInput,
  bpjsKetenagakerjaan: sensitiveInput,
});

export async function updatePersonal(employeeId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN", "HR");

  const before = await db.employee.findUnique({
    where: { id: employeeId },
    select: { birthPlace: true, birthDate: true, gender: true, address: true, ptkpStatus: true, nikKtpEnc: true },
  });
  if (!before) return notFound;

  const parsed = PersonalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);
  const { nik, npwp, bpjsKesehatan, bpjsKetenagakerjaan, ...plain } = parsed.data;

  // Check the NIK against birth date and gender, using the stored NIK if no new one was typed
  const errors: Record<string, string[]> = {};
  const effectiveNik = nik ?? (before.nikKtpEnc ? decrypt(before.nikKtpEnc) : undefined);
  if (effectiveNik) {
    const msg = nikError(effectiveNik, { birthDate: plain.birthDate, gender: plain.gender });
    if (msg) errors[nik ? "nik" : "birthDate"] = [msg];
  }
  if (npwp) {
    const msg = npwpError(npwp);
    if (msg) errors.npwp = [msg];
  }
  if (bpjsKesehatan) {
    const msg = bpjsKesehatanError(bpjsKesehatan);
    if (msg) errors.bpjsKesehatan = [msg];
  }
  if (bpjsKetenagakerjaan) {
    const msg = bpjsKetenagakerjaanError(bpjsKetenagakerjaan);
    if (msg) errors.bpjsKetenagakerjaan = [msg];
  }
  // Never echo sensitive numbers back to the browser, even on error
  const safeValues = new FormData();
  for (const [k, v] of formData) if (!["nik", "npwp", "bpjsKesehatan", "bpjsKetenagakerjaan"].includes(k)) safeValues.append(k, v);
  if (Object.keys(errors).length) return failed(safeValues, errors, "Periksa kembali data. Nomor identitas perlu diketik ulang.");

  const enc = (v: string | undefined) => (v ? { enc: encrypt(v), last4: lastFour(v) } : undefined);
  const nikE = enc(nik);
  const npwpE = enc(npwp);
  const kesE = enc(bpjsKesehatan);
  const tkE = enc(bpjsKetenagakerjaan);

  await db.employee.update({
    where: { id: employeeId },
    data: {
      birthPlace: plain.birthPlace ?? null,
      birthDate: plain.birthDate ?? null,
      gender: plain.gender ?? null,
      address: plain.address ?? null,
      ptkpStatus: plain.ptkpStatus ?? null,
      ...(nikE && { nikKtpEnc: nikE.enc, nikKtpLast4: nikE.last4 }),
      ...(npwpE && { npwpEnc: npwpE.enc, npwpLast4: npwpE.last4 }),
      ...(kesE && { bpjsKesehatanEnc: kesE.enc, bpjsKesehatanLast4: kesE.last4 }),
      ...(tkE && { bpjsKetenagakerjaanEnc: tkE.enc, bpjsKetenagakerjaanLast4: tkE.last4 }),
    },
  });

  // Log which fields changed, never their values
  const changedPlain = (Object.keys(plain) as (keyof typeof plain)[]).filter((k) => {
    const a = before[k];
    const b = plain[k] ?? null;
    return a instanceof Date || b instanceof Date ? a?.valueOf() !== b?.valueOf() : a !== b;
  });
  const changedSensitive = Object.entries({ nik, npwp, bpjsKesehatan, bpjsKetenagakerjaan })
    .filter(([, v]) => v)
    .map(([k]) => k);
  if (changedPlain.length || changedSensitive.length) {
    await writeAudit({
      actorId: user.id,
      action: "employee.personal_updated",
      entityType: "Employee",
      entityId: employeeId,
      changes: { fields: [...changedPlain, ...changedSensitive] },
    });
  }
  refresh();
  return { ok: true, attempt: Date.now() };
}

// ── Reveal one sensitive number (audited) ───────────────────

const revealable = {
  nik: "nikKtpEnc",
  npwp: "npwpEnc",
  bpjsKesehatan: "bpjsKesehatanEnc",
  bpjsKetenagakerjaan: "bpjsKetenagakerjaanEnc",
} as const;

export type RevealField = keyof typeof revealable | "bankAccount";

export async function revealSensitive(
  employeeId: string,
  field: RevealField,
): Promise<{ value: string } | { error: string }> {
  const user = await requireRole("ADMIN", "HR");

  let cipher: string | null | undefined;
  if (field === "bankAccount") {
    // The active payroll account lives in BankAccount, not on Employee
    const acct = await db.bankAccount.findFirst({
      where: { employeeId, isActive: true },
      select: { accountNumberEnc: true },
    });
    cipher = acct?.accountNumberEnc;
  } else if (field in revealable) {
    const column = revealable[field];
    const row = await db.employee.findUnique({ where: { id: employeeId }, select: { [column]: true } });
    cipher = row?.[column as keyof typeof row] as string | null | undefined;
  } else {
    return { error: "Field tidak dikenal." };
  }
  if (!cipher) return { error: "Data belum diisi." };

  await writeAudit({
    actorId: user.id,
    action: "employee.sensitive_viewed",
    entityType: "Employee",
    entityId: employeeId,
    changes: { field },
  });
  return { value: decrypt(cipher) };
}
