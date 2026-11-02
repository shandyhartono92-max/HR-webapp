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
import { formatDate, parseDateOnly } from "@/lib/labels";
import { equalsIgnoringCase } from "@/lib/match";
import { EmployeeStatus, EmploymentType, Gender, PtkpStatus } from "@/generated/prisma/enums";

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

// ── Contract extension / new contract ───────────────────────

const requiredDate = (error: string) =>
  z.string().transform((v, ctx) => {
    const d = parseDateOnly(v);
    if (!d) {
      ctx.addIssue({ code: "custom", message: error });
      return z.NEVER;
    }
    return d;
  });

const RenewSchema = z
  .object({
    type: z.enum(EmploymentType),
    contractNumber: z.string().trim().min(1, { error: "Isi nomor kontrak." }).max(60),
    position: z.string().trim().min(2, { error: "Isi jabatan." }).max(120),
    startDate: requiredDate("Isi tanggal mulai kontrak."),
    endDate: z.preprocess((v) => (v === "" ? undefined : v), requiredDate("Tanggal tidak valid.").optional()),
  })
  .refine((d) => d.type !== "PKWT" || d.endDate, { path: ["endDate"], error: "Kontrak PKWT wajib punya tanggal berakhir." })
  .refine((d) => !d.endDate || d.endDate > d.startDate, { path: ["endDate"], error: "Harus setelah tanggal mulai." });

// PP 35/2021 Pasal 8: a PKWT, including extensions, may last at most 5 years in total
const PKWT_MAX_YEARS = 5;

const addYears = (d: Date, years: number) => {
  const r = new Date(d);
  r.setUTCFullYear(r.getUTCFullYear() + years);
  return r;
};

// Adds the next contract after the current one (extension, renewal, or conversion to
// PKWTT) and moves the employee's type, position and end date to it. The previous
// contract stays in the history, linked through renewalOf.
export async function renewContract(employeeId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN", "HR");

  const emp = await db.employee.findUnique({
    where: { id: employeeId },
    select: {
      status: true,
      position: true,
      employmentType: true,
      endDate: true,
      contracts: {
        orderBy: { startDate: "desc" },
        select: { id: true, type: true, startDate: true, endDate: true, renewedBy: { select: { id: true } } },
      },
    },
  });
  if (!emp) return notFound;
  if (emp.status === "RESIGNED" || emp.status === "TERMINATED") {
    return { message: "Karyawan ini sudah keluar. Kontrak baru tidak bisa dibuat." };
  }

  const parsed = RenewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);
  const d = parsed.data;

  const latest = emp.contracts[0];
  if (latest && d.startDate <= (latest.endDate ?? latest.startDate)) {
    return failed(formData, {
      startDate: [`Harus setelah kontrak sebelumnya ${latest.endDate ? `berakhir (${formatDate(latest.endDate)})` : `dimulai (${formatDate(latest.startDate)})`}.`],
    });
  }
  if (d.type === "PKWT") {
    const firstPkwt = [...emp.contracts].reverse().find((c) => c.type === "PKWT");
    const since = firstPkwt?.startDate ?? d.startDate;
    const limit = addYears(since, PKWT_MAX_YEARS);
    if (d.endDate! > limit) {
      return failed(formData, {
        endDate: [
          `Total PKWT sejak ${formatDate(since)} tidak boleh lebih dari ${PKWT_MAX_YEARS} tahun (PP 35/2021), paling lambat ${formatDate(limit)}. Pertimbangkan PKWTT.`,
        ],
      });
    }
  }
  const taken = await db.contract.findFirst({ where: { contractNumber: equalsIgnoringCase(d.contractNumber) }, select: { id: true } });
  if (taken) return failed(formData, { contractNumber: ["Nomor kontrak ini sudah dipakai."] });

  const contract = await db.$transaction(async (tx) => {
    const created = await tx.contract.create({
      data: {
        employeeId,
        type: d.type,
        contractNumber: d.contractNumber,
        position: d.position,
        startDate: d.startDate,
        endDate: d.endDate ?? null,
        // renewalOf is unique: only link when the previous contract isn't already followed by one
        renewalOfId: latest && !latest.renewedBy ? latest.id : null,
      },
      select: { id: true },
    });
    await tx.employee.update({
      where: { id: employeeId },
      data: {
        employmentType: d.type,
        position: d.position,
        endDate: d.endDate ?? null,
        // Back to work if the previous contract had been marked as ended
        ...(emp.status === "CONTRACT_ENDED" ? { status: "ACTIVE" as const } : {}),
      },
    });
    return created;
  });

  await writeAudit({
    actorId: user.id,
    action: "contract.renewed",
    entityType: "Contract",
    entityId: contract.id,
    changes: {
      employeeId,
      contractNumber: d.contractNumber,
      type: { from: emp.employmentType, to: d.type },
      position: { from: emp.position, to: d.position },
      endDate: { from: emp.endDate?.toISOString().slice(0, 10) ?? null, to: d.endDate?.toISOString().slice(0, 10) ?? null },
    },
  });
  // refresh() also re-renders the menu, so its contract alert badge updates
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
