import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import type { BankCode } from "@/lib/banks";

// ── Account-name inquiry ────────────────────────────────────
// Production: call a disbursement provider's account inquiry (e.g. Xendit or Flip)
// and return the registered holder name. Until BANK_INQUIRY_PROVIDER is set this is
// a STUB for testing: it echoes the employee's name, except account numbers ending
// in 0000, which return a different name so the mismatch path can be tested.

export type InquiryResult = { ok: true; holderName: string; stub: boolean } | { ok: false; error: string };

export async function inquireAccountName(
  bankCode: BankCode,
  accountNumber: string,
  employeeName: string,
): Promise<InquiryResult> {
  if (process.env.BANK_INQUIRY_PROVIDER) {
    return { ok: false, error: "Integrasi pengecekan rekening belum dipasang (lihat src/lib/banking.ts)." };
  }
  void bankCode;
  const holderName = accountNumber.endsWith("0000") ? "NAMA PEMILIK LAIN" : employeeName.toUpperCase();
  return { ok: true, holderName, stub: true };
}

// ── One-time codes ──────────────────────────────────────────

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

export const hashOtp = (code: string) => createHash("sha256").update(code).digest("hex");

export function newOtp() {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return { code, hash: hashOtp(code), expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000) };
}

export function otpMatches(code: string, storedHash: string) {
  const a = Buffer.from(hashOtp(code), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// Delivers the code. There is no email/WhatsApp provider yet, so in development the
// code is returned for the screen (marked as a dev-only shortcut) and logged. In
// production this refuses until a real channel is configured: never show OTPs on screen.
const devCodes: Map<string, string> = ((globalThis as { __devOtp?: Map<string, string> }).__devOtp ??= new Map());

export async function deliverOtp(email: string, code: string, requestId: string): Promise<{ devCode?: string; error?: string }> {
  if (process.env.NODE_ENV === "production") {
    return { error: "Pengiriman OTP belum dikonfigurasi. Hubungi HR." };
  }
  console.log(`[dev] OTP perubahan rekening untuk ${email}: ${code}`);
  devCodes.set(requestId, code);
  return { devCode: code };
}

// Development only: lets the OTP step show the last code (there is no email sender yet)
export function peekDevOtp(requestId: string): string | undefined {
  return process.env.NODE_ENV === "production" ? undefined : devCodes.get(requestId);
}

// ── In-app notifications ────────────────────────────────────

export async function notifyUsers(userIds: string[], n: { type: string; title: string; body: string; link?: string }) {
  if (userIds.length === 0) return;
  await db.notification.createMany({ data: userIds.map((userId) => ({ userId, ...n })) });
}

export async function hrUserIds(excludeUserId?: string | null) {
  const users = await db.user.findMany({
    where: { isActive: true, role: { in: ["ADMIN", "HR"] }, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
