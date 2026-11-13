"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import * as z from "zod";
import { currentSite, siteDb } from "@/lib/db";
import { accountsDb } from "@/lib/accounts-db";
import { setAccess } from "@/lib/site-access";
import { employeeLoginError } from "@/lib/access-rules";
import type { SiteCode } from "@/lib/sites";
import type { Role } from "@/generated/prisma/enums";
import { requireRole, requireUser } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { failed, type FormState } from "@/lib/forms";
import { temporaryPassword } from "@/lib/passwords";

// existingAccount: the email already had an account (it keeps its own password)
export type LoginResult = { error?: string; tempPassword?: string; email?: string; existingAccount?: boolean };

// Creates the employee's login, or resets it if one exists. The temporary password
// is returned once for HR to hand over; the employee must change it at first login.
export async function issueEmployeeLogin(employeeId: string): Promise<LoginResult> {
  const db = await siteDb();
  const user = await requireRole("ADMIN", "HR");

  const emp = await db.employee.findUnique({
    where: { id: employeeId },
    select: { fullName: true, email: true, userId: true, status: true },
  });
  if (!emp) return { error: "Data karyawan tidak ditemukan." };
  if (emp.status === "RESIGNED" || emp.status === "TERMINATED" || emp.status === "CONTRACT_ENDED") {
    return { error: "Karyawan sudah tidak aktif." };
  }
  if (emp.userId === user.id) return { error: "Anda tidak bisa mereset akun Anda sendiri dari sini." };

  const site = (await currentSite()).code;
  const tempPassword = temporaryPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  // Only an employee-only login of this location may be reset or linked from here (Admins excepted)
  const guard = async (accountId: string) =>
    employeeLoginError(await accountsDb.siteAccess.findMany({ where: { accountId }, select: { site: true, role: true } }), site, user.role);

  if (emp.userId) {
    const refused = await guard(emp.userId);
    if (refused) return { error: refused };
    await accountsDb.account.update({ where: { id: emp.userId }, data: { passwordHash, mustChangePassword: true, isActive: true } });
    await ensureEmployeeAccess(emp.userId, site);
    await writeAudit({ actorId: user.id, action: "user.password_reset", entityType: "User", entityId: emp.userId });
    refresh();
    return { tempPassword, email: emp.email };
  }

  // The email may already have an account (e.g. staff of another location): link it and
  // give it access here, keeping its password
  const existing = await accountsDb.account.findUnique({ where: { email: emp.email }, select: { id: true } });
  if (existing) {
    const linked = await db.employee.findFirst({ where: { userId: existing.id }, select: { id: true } });
    if (linked) return { error: `Email ${emp.email} sudah dipakai akun karyawan lain.` };
    const refused = await guard(existing.id);
    if (refused) return { error: refused };
    await ensureEmployeeAccess(existing.id, site);
    await db.employee.update({ where: { id: employeeId }, data: { userId: existing.id } });
    await writeAudit({ actorId: user.id, action: "user.linked", entityType: "User", entityId: existing.id, changes: { employeeId } });
    refresh();
    return { email: emp.email, existingAccount: true };
  }

  const created = await accountsDb.account.create({
    data: { email: emp.email, name: emp.fullName, passwordHash, mustChangePassword: true },
    select: { id: true },
  });
  await setAccess(created.id, site, "EMPLOYEE");
  await db.employee.update({ where: { id: employeeId }, data: { userId: created.id } });
  await writeAudit({
    actorId: user.id,
    action: "user.created",
    entityType: "User",
    entityId: created.id,
    changes: { employeeId, role: "EMPLOYEE" },
  });
  refresh();
  return { tempPassword, email: emp.email };
}

// EMPLOYEE access to this location, unless the account already has a role here
async function ensureEmployeeAccess(accountId: string, site: SiteCode) {
  const access = await accountsDb.siteAccess.findUnique({ where: { accountId_site: { accountId, site } }, select: { role: true } });
  await setAccess(accountId, site, (access?.role as Role | undefined) ?? "EMPLOYEE");
}

const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: "Isi kata sandi saat ini." }),
    newPassword: z
      .string()
      .min(10, { error: "Minimal 10 karakter." })
      .max(200)
      .regex(/[a-zA-Z]/, { error: "Harus ada huruf." })
      .regex(/[0-9]/, { error: "Harus ada angka." }),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { path: ["confirmPassword"], error: "Konfirmasi tidak sama." })
  .refine((d) => d.newPassword !== d.currentPassword, { path: ["newPassword"], error: "Harus berbeda dari kata sandi lama." });

export async function changePassword(_state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser({ allowPasswordChange: true });

  // Passwords are never echoed back into the form
  const parsed = ChangePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, attempt: Date.now() };

  // The password belongs to the account, so the change applies to every location
  const row = await accountsDb.account.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row || !(await bcrypt.compare(parsed.data.currentPassword, row.passwordHash))) {
    await writeAudit({ actorId: user.id, action: "user.password_change_failed", entityType: "User", entityId: user.id });
    return failed(new FormData(), { currentPassword: ["Kata sandi saat ini salah."] });
  }

  await accountsDb.account.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12), mustChangePassword: false },
  });
  await writeAudit({ actorId: user.id, action: "user.password_changed", entityType: "User", entityId: user.id });
  redirect("/dashboard?sandi=diubah");
}
