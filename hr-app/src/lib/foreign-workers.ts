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

// A changed KITAS date (a renewal) starts the notices again
export const kitasRenewalData = (before: Date, after: Date) =>
  before.getTime() === after.getTime() ? {} : { kitasSoonNoticeAt: null, kitasExpiredNoticeAt: null };

const requiredText = (empty: string, max: number) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().min(1, { error: empty }).max(max, { error: `Maksimal ${max} karakter.` }));
const documentNumber = (empty: string) => requiredText(empty, 30).transform((v) => v.toUpperCase());
const requiredDate = (empty: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : ""),
    z.string().transform((v, ctx) => parseDateOnly(v) ?? (ctx.addIssue({ code: "custom", message: empty }), z.NEVER)),
  );

const Schema = z.object({
  fullName: requiredText("Isi nama lengkap.", 120).refine((v) => v.length === 0 || v.length >= 3, { error: "Nama minimal 3 karakter." }),
  passportNumber: documentNumber("Isi nomor paspor."),
  kitasNumber: documentNumber("Isi nomor KITAS."),
  passportExpiry: requiredDate("Isi tanggal berlaku paspor."),
  kitasExpiry: requiredDate("Isi tanggal berlaku KITAS."),
  location: requiredText("Isi lokasi.", 120),
});

export type ForeignWorkerInput = z.output<typeof Schema>;

export function parseForeignWorker(input: Record<string, unknown>): { ok: true; data: ForeignWorkerInput } | { ok: false; errors: Record<string, string[]> } {
  const parsed = Schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, errors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]> };
}
