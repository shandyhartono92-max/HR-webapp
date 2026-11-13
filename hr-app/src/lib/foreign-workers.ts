import * as z from "zod";
import { parseDateOnly } from "@/lib/labels";

// Tenaga Kerja Asing (TKA): foreign workers kept for information, so that no KITAS
// expires unnoticed. Alerts look at the KITAS only; the passport date is shown, never
// alerted. Pure rules, checked by scripts/check-foreign-workers.mts.

export const KITAS_ALERT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ForeignWorkerStatus = "ACTIVE" | "INACTIVE";
export const foreignWorkerStatusLabel: Record<ForeignWorkerStatus, string> = { ACTIVE: "Aktif", INACTIVE: "Non Aktif" };

// "soon" from 30 days before the KITAS expiry up to and including that day, "overdue" after
export function kitasAlert(kitasExpiry: Date, status: ForeignWorkerStatus, today: Date): { level: "overdue" | "soon" | null; daysLeft: number } {
  const daysLeft = Math.round((kitasExpiry.getTime() - today.getTime()) / DAY_MS);
  if (status !== "ACTIVE") return { level: null, daysLeft };
  if (daysLeft < 0) return { level: "overdue", daysLeft };
  if (daysLeft <= KITAS_ALERT_DAYS) return { level: "soon", daysLeft };
  return { level: null, daysLeft };
}

// Prisma filter for the active workers whose KITAS needs attention (badge, banner)
export const kitasAlertWhere = (today: Date) => ({
  status: "ACTIVE" as const,
  kitasExpiry: { lte: new Date(today.getTime() + KITAS_ALERT_DAYS * DAY_MS) },
});

// The notification still to send: one when the KITAS enters the 30-day window, one when
// it has expired. A worker added with an expired KITAS only gets the "expired" one.
export function kitasNoticeDue(
  w: { status: ForeignWorkerStatus; kitasExpiry: Date; kitasSoonNoticeAt: Date | null; kitasExpiredNoticeAt: Date | null },
  today: Date,
): "soon" | "expired" | null {
  const { level } = kitasAlert(w.kitasExpiry, w.status, today);
  if (level === "overdue") return w.kitasExpiredNoticeAt ? null : "expired";
  if (level === "soon") return w.kitasSoonNoticeAt ? null : "soon";
  return null;
}

// The message for a passport or KITAS number already in this location: whose it is, and
// for a Non Aktif owner (a returning worker) how to bring that record back instead
export function clashMessage(kind: "paspor" | "KITAS", owner: { fullName: string; status: ForeignWorkerStatus }): string {
  return owner.status === "INACTIVE"
    ? `Nomor ${kind} ini milik ${owner.fullName} yang berstatus Non Aktif. Buka datanya lewat filter Non Aktif, lalu klik Aktifkan lagi.`
    : `Nomor ${kind} ini sudah dipakai TKA lain: ${owner.fullName}.`;
}

// A changed KITAS date (a renewal) starts the notices again
export const kitasRenewalData = (before: Date, after: Date) =>
  before.getTime() === after.getTime() ? {} : { kitasSoonNoticeAt: null, kitasExpiredNoticeAt: null };

const requiredText = (empty: string, max: number) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().min(1, { error: empty }).max(max, { error: `Maksimal ${max} karakter.` }));
// Spaces, dashes, dots and slashes are dropped and letters upper-cased, so "a-123 4567"
// and "A1234567" are one number (and one duplicate check)
const documentNumber = (empty: string, label: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/[\s\-./]/g, "").toUpperCase() : ""),
    z
      .string()
      .min(1, { error: empty })
      .max(30, { error: "Maksimal 30 karakter." })
      .regex(/^[A-Z0-9]*$/, { error: `Nomor ${label} hanya boleh berisi huruf dan angka.` }),
  );
const requiredDate = (empty: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : ""),
    z.string().transform((v, ctx) => parseDateOnly(v) ?? (ctx.addIssue({ code: "custom", message: empty }), z.NEVER)),
  );

const Schema = z.object({
  fullName: requiredText("Isi nama lengkap.", 120).refine((v) => v.length === 0 || v.length >= 3, { error: "Nama minimal 3 karakter." }),
  passportNumber: documentNumber("Isi nomor paspor.", "paspor"),
  kitasNumber: documentNumber("Isi nomor KITAS.", "KITAS"),
  passportExpiry: requiredDate("Isi tanggal berlaku paspor."),
  kitasExpiry: requiredDate("Isi tanggal berlaku KITAS."),
  location: requiredText("Isi lokasi.", 120),
});

export type ForeignWorkerInput = z.output<typeof Schema>;

// A KITAS runs a few years at most and a passport about ten: a date further than this
// from today, either way, is a mistyped year (2207 for 2027), which would never alert
const PLAUSIBLE_YEARS = { kitasExpiry: 10, passportExpiry: 20 } as const;
const FAR_DATE = "Tanggal ini terlalu jauh dari hari ini. Periksa tahunnya.";

export function parseForeignWorker(
  input: Record<string, unknown>,
  today: Date,
): { ok: true; data: ForeignWorkerInput } | { ok: false; errors: Record<string, string[]> } {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]> };
  const errors: Record<string, string[]> = {};
  for (const [field, years] of Object.entries(PLAUSIBLE_YEARS) as [keyof typeof PLAUSIBLE_YEARS, number][]) {
    if (Math.abs(parsed.data[field].getTime() - today.getTime()) > years * 366 * DAY_MS) errors[field] = [FAR_DATE];
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: parsed.data };
}
