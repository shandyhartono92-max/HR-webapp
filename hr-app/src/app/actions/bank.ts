"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import * as z from "zod";
import { db } from "@/lib/db";
import { requireRole, requireUser, type CurrentUser } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { encrypt, lastFour } from "@/lib/crypto";
import { failed, type FormState } from "@/lib/forms";
import { digitsOnly } from "@/lib/indonesia-id";
import { accountNumberError, bankCodes, banks, normalizeName, type BankCode } from "@/lib/banks";
import {
  deliverOtp,
  hrUserIds,
  inquireAccountName,
  newOtp,
  notifyUsers,
  OTP_MAX_ATTEMPTS,
  otpMatches,
} from "@/lib/banking";

export type BankFormState =
  | (NonNullable<FormState> & { devCode?: string })
  | undefined;

async function myEmployee(user: CurrentUser) {
  if (!user.employee) return null;
  return db.employee.findUnique({
    where: { id: user.employee.id },
    select: { id: true, fullName: true, email: true, status: true },
  });
}

// ── Employee: submit a new account ──────────────────────────

const RequestSchema = z.object({
  bankCode: z.enum(bankCodes as [BankCode, ...BankCode[]], { error: "Pilih bank." }),
  accountNumber: z.string().transform(digitsOnly).pipe(z.string().min(1, { error: "Isi nomor rekening." })),
  accountHolderName: z.string().trim().min(3, { error: "Isi nama pemilik rekening sesuai buku tabungan." }).max(120),
});

export async function submitBankChange(_state: BankFormState, formData: FormData): Promise<BankFormState> {
  const user = await requireUser();
  const emp = await myEmployee(user);
  if (!emp) return { message: "Akun Anda belum terhubung ke data karyawan. Hubungi HR." };
  if (emp.status === "RESIGNED" || emp.status === "TERMINATED") return { message: "Status kepegawaian Anda tidak aktif." };

  // The account number is never echoed back into the form
  const safeValues = new FormData();
  safeValues.set("bankCode", String(formData.get("bankCode") ?? ""));
  safeValues.set("accountHolderName", String(formData.get("accountHolderName") ?? ""));

  const parsed = RequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(safeValues, z.flattenError(parsed.error).fieldErrors);
  const { bankCode, accountNumber, accountHolderName } = parsed.data;
  const lengthError = accountNumberError(bankCode, accountNumber);
  if (lengthError) return failed(safeValues, { accountNumber: [lengthError] });

  const pending = await db.bankChangeRequest.findFirst({
    where: { employeeId: emp.id, status: "PENDING_APPROVAL" },
    select: { id: true },
  });
  if (pending) return failed(safeValues, undefined, "Masih ada permintaan yang menunggu persetujuan HR. Batalkan dulu jika ingin mengganti.");

  const current = await db.bankAccount.findFirst({
    where: { employeeId: emp.id, isActive: true },
    select: { bankCode: true, accountNumberLast4: true },
  });
  if (current && current.bankCode === bankCode && current.accountNumberLast4 === lastFour(accountNumber)) {
    return failed(safeValues, { accountNumber: ["Ini sepertinya rekening yang sedang aktif."] });
  }

  const inquiry = await inquireAccountName(bankCode, accountNumber, emp.fullName);
  if (!inquiry.ok) return failed(safeValues, undefined, inquiry.error);
  const nameMatches = normalizeName(inquiry.holderName) === normalizeName(emp.fullName);

  const otp = newOtp();
  const request = await db.$transaction(async (tx) => {
    // An unconfirmed earlier draft is replaced by this one
    await tx.bankChangeRequest.updateMany({ where: { employeeId: emp.id, status: "DRAFT" }, data: { status: "CANCELLED" } });
    return tx.bankChangeRequest.create({
      data: {
        employeeId: emp.id,
        bankCode,
        bankName: banks[bankCode].name,
        accountNumberEnc: encrypt(accountNumber),
        accountNumberLast4: lastFour(accountNumber),
        accountHolderName,
        inquiryName: inquiry.holderName,
        nameMatches,
        otpHash: otp.hash,
        otpExpiresAt: otp.expiresAt,
      },
      select: { id: true },
    });
  });

  const delivery = await deliverOtp(emp.email, otp.code, request.id);
  await writeAudit({
    actorId: user.id,
    action: "bank_request.created",
    entityType: "BankChangeRequest",
    entityId: request.id,
    changes: { bankCode, last4: lastFour(accountNumber), nameMatches, inquiryStub: inquiry.stub },
  });
  refresh();
  if (delivery.error) return { message: delivery.error };
  return { ok: true, devCode: delivery.devCode, attempt: Date.now() };
}

// ── Employee: confirm with the one-time code ────────────────

async function ownRequest(user: CurrentUser, requestId: string) {
  if (!user.employee) return null;
  return db.bankChangeRequest.findFirst({
    where: { id: requestId, employeeId: user.employee.id },
    select: {
      id: true,
      status: true,
      otpHash: true,
      otpExpiresAt: true,
      otpAttempts: true,
      bankName: true,
      accountNumberLast4: true,
      employee: { select: { fullName: true } },
    },
  });
}

export async function confirmBankOtp(requestId: string, _state: BankFormState, formData: FormData): Promise<BankFormState> {
  const user = await requireUser();
  const req = await ownRequest(user, requestId);
  if (!req || req.status !== "DRAFT" || !req.otpHash || !req.otpExpiresAt) return { message: "Permintaan tidak ditemukan atau sudah diproses." };
  if (req.otpExpiresAt < new Date()) return { message: "Kode sudah kedaluwarsa. Minta kode baru.", attempt: Date.now() };

  const code = digitsOnly(String(formData.get("code") ?? ""));
  if (!otpMatches(code, req.otpHash)) {
    const attempts = req.otpAttempts + 1;
    const exhausted = attempts >= OTP_MAX_ATTEMPTS;
    await db.bankChangeRequest.update({
      where: { id: req.id },
      data: { otpAttempts: attempts, ...(exhausted ? { status: "CANCELLED", otpHash: null } : {}) },
    });
    await writeAudit({ actorId: user.id, action: "bank_request.otp_failed", entityType: "BankChangeRequest", entityId: req.id, changes: { attempts } });
    if (exhausted) {
      refresh();
      return { message: "Terlalu banyak kode salah. Permintaan dibatalkan; silakan ajukan ulang." };
    }
    return { errors: { code: [`Kode salah. Sisa percobaan: ${OTP_MAX_ATTEMPTS - attempts}.`] }, attempt: Date.now() };
  }

  const h = await headers();
  await db.bankChangeRequest.update({
    where: { id: req.id },
    data: {
      status: "PENDING_APPROVAL",
      otpHash: null,
      otpVerifiedAt: new Date(),
      submittedAt: new Date(),
      submittedIp: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    },
  });
  await writeAudit({ actorId: user.id, action: "bank_request.submitted", entityType: "BankChangeRequest", entityId: req.id });

  // HR reviewers (never the requester), plus the employee as a tamper alert
  await notifyUsers(await hrUserIds(user.id), {
    type: "bank_request.pending",
    title: "Perubahan rekening menunggu persetujuan",
    body: `${req.employee.fullName} · ${req.bankName} ••••${req.accountNumberLast4}`,
    link: "/dashboard/rekening",
  });
  await notifyUsers([user.id], {
    type: "bank_request.submitted",
    title: "Permintaan perubahan rekening diajukan",
    body: `${req.bankName} ••••${req.accountNumberLast4}. Jika ini bukan Anda, segera hubungi HR.`,
    link: "/dashboard/rekening",
  });
  refresh();
  return { ok: true, attempt: Date.now() };
}

export async function resendBankOtp(requestId: string): Promise<BankFormState> {
  const user = await requireUser();
  const req = await ownRequest(user, requestId);
  if (!req || req.status !== "DRAFT") return { message: "Permintaan tidak ditemukan atau sudah diproses." };
  const otp = newOtp();
  await db.bankChangeRequest.update({
    where: { id: req.id },
    data: { otpHash: otp.hash, otpExpiresAt: otp.expiresAt, otpAttempts: 0 },
  });
  const delivery = await deliverOtp(user.email, otp.code, req.id);
  await writeAudit({ actorId: user.id, action: "bank_request.otp_resent", entityType: "BankChangeRequest", entityId: req.id });
  refresh();
  return delivery.error ? { message: delivery.error } : { ok: true, devCode: delivery.devCode, attempt: Date.now() };
}

export async function cancelBankRequest(requestId: string): Promise<BankFormState> {
  const user = await requireUser();
  const req = await ownRequest(user, requestId);
  if (!req || (req.status !== "DRAFT" && req.status !== "PENDING_APPROVAL")) return { message: "Permintaan tidak bisa dibatalkan." };
  await db.bankChangeRequest.update({ where: { id: req.id }, data: { status: "CANCELLED", otpHash: null } });
  await writeAudit({ actorId: user.id, action: "bank_request.cancelled", entityType: "BankChangeRequest", entityId: req.id });
  refresh();
  return { ok: true };
}

// ── HR: enter an account for an employee (maker) ────────────

const HrRequestSchema = RequestSchema.extend({
  basis: z.string().trim().min(10, { error: "Tulis dasar pengajuan, misal: formulir bertanda tangan karyawan 3 Nov 2026." }).max(300),
});

// For employees without a login (or who asked HR in person). There is no OTP, so the
// request goes straight to approval, which another HR/Admin must give. The basis
// (e.g. a signed paper form) is kept in the audit log.
export async function submitBankChangeByHr(employeeId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN", "HR");
  const emp = await db.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, fullName: true, status: true, userId: true, anonymizedAt: true },
  });
  if (!emp || emp.anonymizedAt) return { message: "Data karyawan tidak ditemukan." };
  if (emp.status === "RESIGNED" || emp.status === "TERMINATED") return { message: "Karyawan ini sudah keluar." };
  if (emp.userId === user.id) return { message: "Rekening Anda sendiri diajukan lewat menu Rekening Gaji." };

  const safeValues = new FormData();
  for (const k of ["bankCode", "accountHolderName", "basis"]) safeValues.set(k, String(formData.get(k) ?? ""));
  const parsed = HrRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(safeValues, z.flattenError(parsed.error).fieldErrors);
  const { bankCode, accountNumber, accountHolderName, basis } = parsed.data;
  const lengthError = accountNumberError(bankCode, accountNumber);
  if (lengthError) return failed(safeValues, { accountNumber: [lengthError] });

  const pending = await db.bankChangeRequest.findFirst({ where: { employeeId, status: "PENDING_APPROVAL" }, select: { id: true } });
  if (pending) return failed(safeValues, undefined, "Masih ada pengajuan rekening yang menunggu persetujuan untuk karyawan ini.");

  const current = await db.bankAccount.findFirst({ where: { employeeId, isActive: true }, select: { bankCode: true, accountNumberLast4: true } });
  if (current && current.bankCode === bankCode && current.accountNumberLast4 === lastFour(accountNumber)) {
    return failed(safeValues, { accountNumber: ["Ini sepertinya rekening yang sedang aktif."] });
  }

  const inquiry = await inquireAccountName(bankCode, accountNumber, emp.fullName);
  if (!inquiry.ok) return failed(safeValues, undefined, inquiry.error);
  const nameMatches = normalizeName(inquiry.holderName) === normalizeName(emp.fullName);

  const h = await headers();
  const request = await db.$transaction(async (tx) => {
    await tx.bankChangeRequest.updateMany({ where: { employeeId, status: "DRAFT" }, data: { status: "CANCELLED" } });
    return tx.bankChangeRequest.create({
      data: {
        employeeId,
        bankCode,
        bankName: banks[bankCode].name,
        accountNumberEnc: encrypt(accountNumber),
        accountNumberLast4: lastFour(accountNumber),
        accountHolderName,
        inquiryName: inquiry.holderName,
        nameMatches,
        status: "PENDING_APPROVAL",
        requestedById: user.id,
        submittedAt: new Date(),
        submittedIp: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      },
      select: { id: true },
    });
  });
  await writeAudit({
    actorId: user.id,
    action: "bank_request.created_by_hr",
    entityType: "BankChangeRequest",
    entityId: request.id,
    changes: { employeeId, bankCode, last4: lastFour(accountNumber), nameMatches, basis, inquiryStub: inquiry.stub },
  });

  // Any other HR/Admin can approve; the employee (if they log in) sees it as a tamper alert
  const checkers = (await hrUserIds(user.id)).filter((id) => id !== emp.userId);
  await notifyUsers(checkers, {
    type: "bank_request.pending",
    title: "Perubahan rekening (diinput HR) menunggu persetujuan",
    body: `${emp.fullName} · ${banks[bankCode].name} ••••${lastFour(accountNumber)} · diinput oleh ${user.name}`,
    link: "/dashboard/rekening",
  });
  if (emp.userId) {
    await notifyUsers([emp.userId], {
      type: "bank_request.submitted",
      title: "HR mengajukan perubahan rekening Anda",
      body: `${banks[bankCode].name} ••••${lastFour(accountNumber)}. Jika Anda tidak meminta ini, segera hubungi HR.`,
      link: "/dashboard/rekening",
    });
  }
  refresh();
  return {
    ok: true,
    message: checkers.length
      ? undefined
      : "Tersimpan, tetapi belum ada HR/Admin lain yang bisa menyetujui. Buat akun HR kedua terlebih dahulu.",
    attempt: Date.now(),
  };
}

// The HR maker can withdraw their own request before it is reviewed
export async function cancelBankRequestByHr(requestId: string): Promise<void> {
  const user = await requireRole("ADMIN", "HR");
  const req = await db.bankChangeRequest.findFirst({
    where: { id: requestId, requestedById: user.id, status: "PENDING_APPROVAL" },
    select: { id: true },
  });
  if (!req) return;
  await db.bankChangeRequest.update({ where: { id: req.id }, data: { status: "CANCELLED" } });
  await writeAudit({ actorId: user.id, action: "bank_request.cancelled", entityType: "BankChangeRequest", entityId: req.id });
  refresh();
}

// ── HR: approve or reject (maker-checker) ───────────────────

async function reviewable(user: CurrentUser, requestId: string) {
  const req = await db.bankChangeRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      employeeId: true,
      nameMatches: true,
      bankCode: true,
      bankName: true,
      accountNumberEnc: true,
      accountNumberLast4: true,
      accountHolderName: true,
      requestedById: true,
      employee: { select: { userId: true } },
    },
  });
  if (!req || req.status !== "PENDING_APPROVAL") return { error: "Permintaan tidak ditemukan atau sudah diproses." } as const;
  // The person who asked for the change can never be the one who approves it
  if (req.employee.userId === user.id) return { error: "Anda tidak bisa memproses permintaan rekening Anda sendiri." } as const;
  if (req.requestedById === user.id) return { error: "Pengajuan yang Anda input sendiri harus disetujui HR/Admin lain." } as const;
  return { req } as const;
}

const ApproveSchema = z.object({
  effectivePayroll: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: "Pilih bulan penggajian." }),
});

export async function approveBankRequest(requestId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN", "HR");
  const r = await reviewable(user, requestId);
  if ("error" in r) return { message: r.error };
  const { req } = r;

  const parsed = ApproveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);
  if (req.nameMatches === false && formData.get("confirmMismatch") !== "on") {
    return failed(formData, { confirmMismatch: ["Nama di bank berbeda. Centang jika Anda sudah memverifikasi langsung dengan karyawan."] });
  }

  const effectiveFrom = new Date(`${parsed.data.effectivePayroll}-01T00:00:00Z`);
  await db.$transaction(async (tx) => {
    await tx.bankAccount.updateMany({
      where: { employeeId: req.employeeId, isActive: true },
      data: { isActive: false, deactivatedAt: new Date() },
    });
    await tx.bankAccount.create({
      data: {
        employeeId: req.employeeId,
        bankCode: req.bankCode,
        bankName: req.bankName,
        accountNumberEnc: req.accountNumberEnc,
        accountNumberLast4: req.accountNumberLast4,
        accountHolderName: req.accountHolderName,
        effectiveFrom,
        requestId: req.id,
      },
    });
    await tx.bankChangeRequest.update({
      where: { id: req.id },
      data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date(), effectivePayroll: parsed.data.effectivePayroll },
    });
  });

  await writeAudit({
    actorId: user.id,
    action: "bank_request.approved",
    entityType: "BankChangeRequest",
    entityId: req.id,
    changes: { effectivePayroll: parsed.data.effectivePayroll, nameMatches: req.nameMatches },
  });
  if (req.employee.userId) {
    await notifyUsers([req.employee.userId], {
      type: "bank_request.approved",
      title: "Perubahan rekening disetujui",
      body: `${req.bankName} ••••${req.accountNumberLast4} berlaku mulai penggajian ${parsed.data.effectivePayroll}.`,
      link: "/dashboard/rekening",
    });
  }
  refresh();
  return { ok: true };
}

const RejectSchema = z.object({
  rejectionReason: z.string().trim().min(5, { error: "Tulis alasan penolakan." }).max(500),
});

export async function rejectBankRequest(requestId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN", "HR");
  const r = await reviewable(user, requestId);
  if ("error" in r) return { message: r.error };

  const parsed = RejectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);

  await db.bankChangeRequest.update({
    where: { id: requestId },
    data: { status: "REJECTED", reviewedById: user.id, reviewedAt: new Date(), rejectionReason: parsed.data.rejectionReason },
  });
  await writeAudit({ actorId: user.id, action: "bank_request.rejected", entityType: "BankChangeRequest", entityId: requestId });
  if (r.req.employee.userId) {
    await notifyUsers([r.req.employee.userId], {
      type: "bank_request.rejected",
      title: "Perubahan rekening ditolak",
      body: parsed.data.rejectionReason,
      link: "/dashboard/rekening",
    });
  }
  refresh();
  return { ok: true };
}

// ── Notifications ───────────────────────────────────────────

export async function markNotificationsRead(): Promise<void> {
  const user = await requireUser({ allowPasswordChange: true });
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  refresh();
}
