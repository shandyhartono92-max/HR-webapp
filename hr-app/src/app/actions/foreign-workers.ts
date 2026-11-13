"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { siteDb } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { failed, type FormState } from "@/lib/forms";
import { todayDate } from "@/lib/labels";
import { formSiteRefusal } from "@/lib/form-site";
import { clashMessage, kitasRenewalData, parseForeignWorker, type ForeignWorkerInput, type ForeignWorkerStatus } from "@/lib/foreign-workers";
import { Prisma } from "@/generated/prisma/client";

// Tenaga Kerja Asing: add, edit, Aktif / Non Aktif. No delete: a worker who left is
// set Non Aktif. Admin and HR only.

// Passport and KITAS numbers are unique within a location (stored normalised); the
// message names the owner, and points a Non Aktif owner at "Aktifkan lagi"
async function clashErrors(data: ForeignWorkerInput, exceptId?: string) {
  const db = await siteDb();
  const not = exceptId ? { id: { not: exceptId } } : {};
  const owner = { fullName: true, status: true } as const;
  const [passport, kitas] = await Promise.all([
    db.foreignWorker.findFirst({ where: { passportNumber: data.passportNumber, ...not }, select: owner }),
    db.foreignWorker.findFirst({ where: { kitasNumber: data.kitasNumber, ...not }, select: owner }),
  ]);
  const errors: Record<string, string[]> = {};
  if (passport) errors.passportNumber = [clashMessage("paspor", passport)];
  if (kitas) errors.kitasNumber = [clashMessage("KITAS", kitas)];
  return errors;
}

const isUniqueClash = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export async function createForeignWorker(_state: FormState, formData: FormData): Promise<FormState> {
  const db = await siteDb();
  const user = await requireRole("ADMIN", "HR");
  const moved = await formSiteRefusal(formData);
  if (moved) return { message: moved, attempt: Date.now() };

  const parsed = parseForeignWorker(Object.fromEntries(formData), todayDate());
  if (!parsed.ok) return failed(formData, parsed.errors, "Periksa kembali isian yang ditandai.");
  const clash = await clashErrors(parsed.data);
  if (Object.keys(clash).length) return failed(formData, clash, "Periksa kembali isian yang ditandai.");

  let id: string;
  try {
    ({ id } = await db.foreignWorker.create({ data: parsed.data, select: { id: true } }));
  } catch (e) {
    if (isUniqueClash(e)) return failed(formData, undefined, "Nomor paspor atau KITAS baru saja dipakai data lain. Periksa lagi.");
    throw e;
  }
  await writeAudit({ actorId: user.id, action: "foreign_worker.created", entityType: "ForeignWorker", entityId: id, changes: { fields: Object.keys(parsed.data) } });
  revalidatePath("/dashboard", "layout"); // the menu badge
  redirect("/dashboard/tka?ditambah=1");
}

export async function updateForeignWorker(id: string, _state: FormState, formData: FormData): Promise<FormState> {
  const db = await siteDb();
  const user = await requireRole("ADMIN", "HR");
  const before = await db.foreignWorker.findUnique({ where: { id } });
  if (!before) return { message: "Data TKA tidak ditemukan.", attempt: Date.now() };

  const parsed = parseForeignWorker(Object.fromEntries(formData), todayDate());
  if (!parsed.ok) return failed(formData, parsed.errors, "Periksa kembali isian yang ditandai.");
  const clash = await clashErrors(parsed.data, id);
  if (Object.keys(clash).length) return failed(formData, clash, "Periksa kembali isian yang ditandai.");

  try {
    // A new KITAS date (a renewal) starts the expiry notifications again
    await db.foreignWorker.update({ where: { id }, data: { ...parsed.data, ...kitasRenewalData(before.kitasExpiry, parsed.data.kitasExpiry) } });
  } catch (e) {
    if (isUniqueClash(e)) return failed(formData, undefined, "Nomor paspor atau KITAS baru saja dipakai data lain. Periksa lagi.");
    throw e;
  }
  // Field names only: the audit log can never be wiped
  const changed = (Object.keys(parsed.data) as (keyof ForeignWorkerInput)[]).filter((k) => String(before[k]) !== String(parsed.data[k]));
  if (changed.length) {
    await writeAudit({ actorId: user.id, action: "foreign_worker.updated", entityType: "ForeignWorker", entityId: id, changes: { fields: changed } });
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true, attempt: Date.now() };
}

export async function setForeignWorkerStatus(id: string, status: ForeignWorkerStatus): Promise<{ error?: string }> {
  const db = await siteDb();
  const user = await requireRole("ADMIN", "HR");
  if (status !== "ACTIVE" && status !== "INACTIVE") return { error: "Status tidak dikenal." };
  const before = await db.foreignWorker.findUnique({ where: { id }, select: { status: true } });
  if (!before) return { error: "Data TKA tidak ditemukan." };
  if (before.status === status) return {};
  await db.foreignWorker.update({ where: { id }, data: { status } });
  await writeAudit({ actorId: user.id, action: "foreign_worker.status_changed", entityType: "ForeignWorker", entityId: id, changes: { from: before.status, to: status } });
  revalidatePath("/dashboard", "layout");
  return {};
}
