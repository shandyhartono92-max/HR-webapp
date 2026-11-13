"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { currentSite, siteDb } from "@/lib/db";
import { accountsDb } from "@/lib/accounts-db";
import { setAccess, syncMirrorEverywhere } from "@/lib/site-access";
import { employeeLoginError } from "@/lib/access-rules";
import { requireRole } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { decrypt, encrypt, lastFour } from "@/lib/crypto";
import { failed, optionalDate, optionalText, type FormState } from "@/lib/forms";
import { isTraineeNumber, trainingErrors } from "@/lib/training";
import { checkWorkLocation, warehouseFor, workLocationFields } from "@/lib/work-location";
import {
  bpjsKesehatanError,
  bpjsKetenagakerjaanError,
  digitsOnly,
  isIndonesianMobile,
  nikError,
  normalizePhone,
  npwpError,
} from "@/lib/indonesia-id";
import { formatDate, parseDateOnly, todayDate } from "@/lib/labels";
import { equalsIgnoringCase } from "@/lib/match";
import type { Prisma } from "@/generated/prisma/client";
import { EmployeeStatus, EmploymentType, Gender, PtkpStatus } from "@/generated/prisma/enums";

const notFound: FormState = { message: "Data karyawan tidak ditemukan." };

// ── Employment details ──────────────────────────────────────

const LEFT: EmployeeStatus[] = ["RESIGNED", "TERMINATED", "CONTRACT_ENDED"];

const LOGIN_CLOSED = "Akun login karyawan ini otomatis dinonaktifkan.";
// A returning employee's login stays off: the app cannot tell whether it was closed
// by their leaving or on purpose. HR turns it back on with a password reset.
const LOGIN_STILL_OFF = "Akun login karyawan ini masih nonaktif. Klik Reset kata sandi di bagian Akun login untuk mengaktifkannya lagi.";

const EmploymentSchema = z
  .object({
    departmentId: z.string().min(1, { error: "Pilih departemen." }),
    position: z.string().trim().min(2, { error: "Isi jabatan." }).max(120),
    ...workLocationFields,
    status: z.enum(EmployeeStatus),
    managerId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable()),
    exitDate: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : v),
      z
        .string()
        .transform((v, ctx) => parseDateOnly(v) ?? (ctx.addIssue({ code: "custom", message: "Tanggal tidak valid." }), z.NEVER))
        .optional(),
    ),
  })
  // Someone who has left may stay without a location (e.g. employees from before the field)
  .superRefine((d, ctx) => checkWorkLocation({ required: !LEFT.includes(d.status) })(d, ctx));

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export async function updateEmployment(employeeId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const db = await siteDb();
  const user = await requireRole("ADMIN", "HR");

  const before = await db.employee.findUnique({
    where: { id: employeeId },
    select: {
      departmentId: true,
      position: true,
      workLocation: true,
      warehouse: true,
      status: true,
      managerId: true,
      exitDate: true,
      endDate: true,
      joinDate: true,
      anonymizedAt: true,
      userId: true,
      user: { select: { role: true, isActive: true } },
    },
  });
  if (!before) return notFound;
  if (before.anonymizedAt) return { message: "Data karyawan ini sudah dianonimkan dan tidak bisa diubah." };

  const parsed = EmploymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);
  const { exitDate: typedExit, warehouse: typedWarehouse, ...rest } = parsed.data;
  // null, not undefined, so an untouched empty location does not show up as a change in the audit log
  const data = { ...rest, workLocation: rest.workLocation ?? null, warehouse: warehouseFor(rest.workLocation, typedWarehouse) };

  if (data.managerId === employeeId) return failed(formData, { managerId: ["Atasan tidak boleh diri sendiri."] });
  const [dept, manager] = await Promise.all([
    db.department.findUnique({ where: { id: data.departmentId }, select: { id: true } }),
    data.managerId ? db.employee.findUnique({ where: { id: data.managerId }, select: { id: true } }) : true,
  ]);
  if (!dept) return failed(formData, { departmentId: ["Departemen tidak ditemukan."] });
  if (!manager) return failed(formData, { managerId: ["Atasan tidak ditemukan."] });

  // Leaving: keep the last working day (typed, else the contract end date for an
  // ended contract, else today). It starts the retention period for personal data.
  const leaving = LEFT.includes(data.status);
  if (typedExit && !leaving) {
    return failed(formData, { exitDate: ["Tanggal keluar hanya untuk status Mengundurkan diri, Diberhentikan, atau Kontrak berakhir."] });
  }
  const exitDate = leaving ? (typedExit ?? before.exitDate ?? (data.status === "CONTRACT_ENDED" ? before.endDate : null) ?? todayDate()) : null;
  if (exitDate && exitDate < before.joinDate) return failed(formData, { exitDate: ["Tanggal keluar sebelum tanggal mulai bekerja."] });

  // Someone who leaves loses access at once. Their login goes with them, so guard
  // against locking out the person doing this, or the only working Admin.
  const closesLogin = leaving && Boolean(before.user?.isActive);
  if (closesLogin && before.userId === user.id) {
    return failed(formData, { status: ["Anda tidak bisa mengubah status Anda sendiri menjadi keluar. Minta HR/Admin lain."] });
  }
  if (closesLogin && before.user?.role === "ADMIN") {
    const otherAdmins = await db.user.count({ where: { role: "ADMIN", isActive: true, id: { not: before.userId! } } });
    if (otherAdmins === 0) {
      return failed(formData, { status: ["Karyawan ini satu-satunya Admin aktif. Jadikan akun lain Admin dulu di menu Pengguna."] });
    }
  }

  // The account loses access to this location first (access elsewhere, if any, stays).
  // Access is what lets someone in, so if this fails nothing has been saved yet.
  if (closesLogin) await setAccess(before.userId!, (await currentSite()).code, null);
  await db.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: employeeId }, data: { ...data, exitDate } });
    if (closesLogin) await tx.user.update({ where: { id: before.userId! }, data: { isActive: false } });
  });
  if (closesLogin) {
    await writeAudit({
      actorId: user.id,
      action: "user.deactivated",
      entityType: "User",
      entityId: before.userId!,
      changes: { reason: "employee_left", employeeId, status: data.status },
    });
  }

  const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => data[k] !== before[k]);
  const changes: Record<string, { from: unknown; to: unknown }> = Object.fromEntries(
    changed.map((k) => [k, { from: before[k], to: data[k] }]),
  );
  if (iso(exitDate) !== iso(before.exitDate)) changes.exitDate = { from: iso(before.exitDate), to: iso(exitDate) };
  if (Object.keys(changes).length) {
    await writeAudit({
      actorId: user.id,
      action: "employee.employment_updated",
      entityType: "Employee",
      entityId: employeeId,
      changes: changes as Prisma.InputJsonValue,
    });
  }
  refresh();
  if (closesLogin) return { ok: true, message: LOGIN_CLOSED, attempt: Date.now() };
  if (!leaving && before.user && !before.user.isActive) return { ok: true, message: LOGIN_STILL_OFF, attempt: Date.now() };
  return { ok: true, attempt: Date.now() };
}

// ── Identity (name, contact, employee number, join date) ────

const IdentitySchema = z.object({
  fullName: z.string().trim().min(3, { error: "Nama minimal 3 karakter." }).max(120),
  email: z.email({ error: "Email tidak valid." }).trim().toLowerCase(),
  phone: z
    .string()
    .refine(isIndonesianMobile, { error: "Masukkan nomor HP Indonesia, misal 0812xxxxxxx." })
    .transform(normalizePhone),
  employeeNumber: z.string().trim().min(1, { error: "Isi Employee ID." }).max(30),
  joinDate: z.string().transform((v, ctx) => parseDateOnly(v) ?? (ctx.addIssue({ code: "custom", message: "Isi tanggal mulai bekerja." }), z.NEVER)),
  // With the Employee ID, since a trainee's ID starts with T (src/lib/training.ts)
  trainingStart: optionalDate,
  trainingEnd: optionalDate,
});

// Fixes typos from hiring or import, and sets the training period.
// The login email (if any) follows the employee's email.
export async function updateIdentity(employeeId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const db = await siteDb();
  const user = await requireRole("ADMIN", "HR");
  const before = await db.employee.findUnique({
    where: { id: employeeId },
    select: {
      fullName: true,
      email: true,
      phone: true,
      employeeNumber: true,
      joinDate: true,
      endDate: true,
      exitDate: true,
      trainingStart: true,
      trainingEnd: true,
      traineeNumber: true,
      userId: true,
      anonymizedAt: true,
      contracts: { orderBy: { startDate: "asc" }, take: 1, select: { startDate: true } },
    },
  });
  if (!before) return notFound;
  if (before.anonymizedAt) return { message: "Data karyawan ini sudah dianonimkan dan tidak bisa diubah." };

  const parsed = IdentitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);
  const d = parsed.data;

  // The join date opens the employment: no contract may start before it, and it
  // must come before the contract end and the exit date
  const firstContract = before.contracts[0]?.startDate;
  if (firstContract && d.joinDate > firstContract) {
    return failed(formData, { joinDate: [`Tidak boleh setelah kontrak pertama dimulai (${formatDate(firstContract)}).`] });
  }
  if (before.endDate && d.joinDate >= before.endDate) return failed(formData, { joinDate: ["Harus sebelum tanggal kontrak berakhir."] });
  if (before.exitDate && d.joinDate > before.exitDate) {
    return failed(formData, { joinDate: [`Tidak boleh setelah tanggal keluar (${formatDate(before.exitDate)}).`] });
  }
  const tErr = trainingErrors(d, todayDate());
  if (Object.keys(tErr).length) return failed(formData, tErr);
  // After graduation the T is gone for good: the job only drops it once (traineeNumber
  // keeps the old one), so a new T number here would never change back by itself
  if (before.traineeNumber && isTraineeNumber(d.employeeNumber)) {
    return failed(formData, {
      employeeNumber: [`Karyawan ini sudah selesai training (ID training ${before.traineeNumber}). Employee ID tidak bisa berawalan T lagi.`],
    });
  }

  const [numberTaken, emailTaken, loginTaken] = await Promise.all([
    // A former trainee number (T001) is never handed out again
    db.employee.findFirst({
      where: {
        id: { not: employeeId },
        OR: [{ employeeNumber: equalsIgnoringCase(d.employeeNumber) }, { traineeNumber: equalsIgnoringCase(d.employeeNumber) }],
      },
      select: { id: true },
    }),
    db.employee.findFirst({ where: { email: equalsIgnoringCase(d.email), id: { not: employeeId } }, select: { id: true } }),
    // Login emails are unique across every location, so the accounts database decides
    before.userId
      ? accountsDb.account.findFirst({ where: { email: equalsIgnoringCase(d.email), id: { not: before.userId } }, select: { id: true } })
      : null,
  ]);
  const errors: Record<string, string[]> = {};
  if (numberTaken) errors.employeeNumber = ["Employee ID ini sudah dipakai karyawan lain, atau pernah dipakai sebagai ID training."];
  if (emailTaken) errors.email = ["Email ini sudah dipakai karyawan lain."];
  else if (loginTaken) errors.email = ["Email ini sudah dipakai akun login lain."];
  if (Object.keys(errors).length) return failed(formData, errors);

  // The login's name and email belong to the account and show in every location. A
  // login that is also a staff account, or used in another location, is not HR's to
  // rename: only an Admin may (otherwise HR could redirect a staff login's email)
  const identityChanged = before.userId && (d.email !== before.email || d.fullName !== before.fullName);
  if (identityChanged) {
    const access = await accountsDb.siteAccess.findMany({ where: { accountId: before.userId! }, select: { site: true, role: true } });
    if (employeeLoginError(access, (await currentSite()).code, user.role)) {
      return failed(formData, { email: ["Login karyawan ini juga akun staf atau dipakai di lokasi lain. Nama dan emailnya hanya bisa diubah Admin."] });
    }
  }
  // The employee record first: if it fails (e.g. a number taken a moment ago), the
  // login is left untouched. Then the account, and its copies in other locations.
  await db.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: employeeId }, data: d });
    if (before.userId) {
      await tx.user.update({ where: { id: before.userId }, data: { email: d.email, name: d.fullName } });
      // Jobs show the hiring manager's name as text; keep it in step with the account
      await tx.job.updateMany({ where: { hiringManagerId: before.userId }, data: { hiringManagerName: d.fullName } });
    }
  });
  if (before.userId) {
    await accountsDb.account.update({ where: { id: before.userId }, data: { email: d.email, name: d.fullName } });
    await syncMirrorEverywhere(before.userId);
  }

  const dates = (x: { joinDate: Date; trainingStart: Date | null; trainingEnd: Date | null }) => ({
    joinDate: iso(x.joinDate),
    trainingStart: iso(x.trainingStart),
    trainingEnd: iso(x.trainingEnd),
  });
  const plain = { ...before, ...dates(before) };
  const after = { ...d, ...dates(d) };
  const keys = ["fullName", "email", "phone", "employeeNumber", "joinDate", "trainingStart", "trainingEnd"] as const;
  // The audit log can never be edited, so it must not keep personal data that retention
  // will later wipe: name, email and phone are recorded as "changed" without their values
  const personal = new Set<string>(["fullName", "email", "phone"]);
  const changes = Object.fromEntries(
    keys.filter((k) => plain[k] !== after[k]).map((k) => [k, personal.has(k) ? "changed" : { from: plain[k], to: after[k] }]),
  );
  if (Object.keys(changes).length) {
    await writeAudit({ actorId: user.id, action: "employee.identity_updated", entityType: "Employee", entityId: employeeId, changes });
  }
  refresh();
  return { ok: true, attempt: Date.now() };
}

// ── Delete an employee entered by mistake ───────────────────

// Only for records with nothing attached yet. Anyone who actually worked here keeps
// their record: change the status instead, and retention anonymises it later.
export async function deletionBlockers(employeeId: string): Promise<string[]> {
  const db = await siteDb();
  await requireRole("ADMIN", "HR");
  const e = await db.employee.findUnique({
    where: { id: employeeId },
    select: {
      userId: true,
      _count: { select: { letters: true, documents: true, bankAccounts: true, bankChangeRequests: true, reports: true } },
    },
  });
  if (!e) return ["Data karyawan tidak ditemukan."];
  const b: string[] = [];
  if (e._count.letters) b.push(`${e._count.letters} surat sudah diterbitkan`);
  if (e._count.documents) b.push(`${e._count.documents} dokumen tersimpan`);
  if (e._count.bankAccounts || e._count.bankChangeRequests) b.push("ada data rekening gaji");
  if (e.userId) b.push("sudah punya akun login");
  if (e._count.reports) b.push(`menjadi atasan ${e._count.reports} karyawan`);
  return b;
}

export async function deleteEmployee(employeeId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const db = await siteDb();
  const user = await requireRole("ADMIN", "HR");
  const emp = await db.employee.findUnique({
    where: { id: employeeId },
    select: { employeeNumber: true, fullName: true, applicationId: true, _count: { select: { contracts: true } } },
  });
  if (!emp) return notFound;

  const blockers = await deletionBlockers(employeeId);
  if (blockers.length) return { message: `Tidak bisa dihapus: ${blockers.join(", ")}. Ubah statusnya saja.`, attempt: Date.now() };
  if (String(formData.get("confirmNumber") ?? "").trim().toLowerCase() !== emp.employeeNumber.toLowerCase()) {
    return failed(formData, { confirmNumber: [`Ketik ${emp.employeeNumber} untuk mengonfirmasi.`] });
  }

  await db.$transaction([
    db.contract.deleteMany({ where: { employeeId } }),
    db.employee.delete({ where: { id: employeeId } }),
  ]);
  await writeAudit({
    actorId: user.id,
    action: "employee.deleted",
    entityType: "Employee",
    entityId: employeeId,
    changes: { employeeNumber: emp.employeeNumber, contracts: emp._count.contracts, fromApplication: emp.applicationId },
  });
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/karyawan?dihapus=${encodeURIComponent(emp.employeeNumber)}`);
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
  const db = await siteDb();
  const user = await requireRole("ADMIN", "HR");

  const emp = await db.employee.findUnique({
    where: { id: employeeId },
    select: {
      status: true,
      position: true,
      employmentType: true,
      endDate: true,
      user: { select: { isActive: true } },
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
        ...(emp.status === "CONTRACT_ENDED" ? { status: "ACTIVE" as const, exitDate: null } : {}),
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
  if (emp.user && !emp.user.isActive) return { ok: true, message: LOGIN_STILL_OFF, attempt: Date.now() };
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
  motherMaidenName: optionalText(80),
  ptkpStatus: z.preprocess((v) => (v === "" ? undefined : v), z.enum(PtkpStatus).optional()),
  nik: sensitiveInput,
  npwp: sensitiveInput,
  bpjsKesehatan: sensitiveInput,
  bpjsKetenagakerjaan: sensitiveInput,
});

export async function updatePersonal(employeeId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const db = await siteDb();
  const user = await requireRole("ADMIN", "HR");

  const before = await db.employee.findUnique({
    where: { id: employeeId },
    select: { birthPlace: true, birthDate: true, gender: true, address: true, motherMaidenName: true, ptkpStatus: true, nikKtpEnc: true, anonymizedAt: true },
  });
  if (!before) return notFound;
  if (before.anonymizedAt) return { message: "Data karyawan ini sudah dianonimkan dan tidak bisa diubah." };

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
      motherMaidenName: plain.motherMaidenName ?? null,
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
  const db = await siteDb();
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
