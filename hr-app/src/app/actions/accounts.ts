"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import * as z from "zod";
import { db } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { failed, type FormState } from "@/lib/forms";
import { temporaryPassword } from "@/lib/passwords";

export type LoginResult = { error?: string; tempPassword?: string; email?: string };

// Creates the employee's login, or resets it if one exists. The temporary password
// is returned once for HR to hand over; the employee must change it at first login.
export async function issueEmployeeLogin(employeeId: string): Promise<LoginResult> {
  const user = await requireRole("ADMIN", "HR");

  const emp = await db.employee.findUnique({
    where: { id: employeeId },
    select: { fullName: true, email: true, userId: true, status: true },
  });
  if (!emp) return { error: "Data karyawan tidak ditemukan." };
  if (emp.status === "RESIGNED" || emp.status === "TERMINATED") return { error: "Karyawan sudah tidak aktif." };
  if (emp.userId === user.id) return { error: "Anda tidak bisa mereset akun Anda sendiri dari sini." };

  const tempPassword = temporaryPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  if (emp.userId) {
    await db.user.update({
      where: { id: emp.userId },
      data: { passwordHash, mustChangePassword: true, isActive: true },
    });
    await writeAudit({ actorId: user.id, action: "user.password_reset", entityType: "User", entityId: emp.userId });
    refresh();
    return { tempPassword, email: emp.email };
  }

  const taken = await db.user.findUnique({ where: { email: emp.email }, select: { id: true } });
  if (taken) return { error: `Email ${emp.email} sudah dipakai akun lain.` };

  const created = await db.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { email: emp.email, name: emp.fullName, role: "EMPLOYEE", passwordHash, mustChangePassword: true },
      select: { id: true },
    });
    await tx.employee.update({ where: { id: employeeId }, data: { userId: u.id } });
    return u;
  });
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

  const row = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row || !(await bcrypt.compare(parsed.data.currentPassword, row.passwordHash))) {
    await writeAudit({ actorId: user.id, action: "user.password_change_failed", entityType: "User", entityId: user.id });
    return failed(new FormData(), { currentPassword: ["Kata sandi saat ini salah."] });
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12), mustChangePassword: false },
  });
  await writeAudit({ actorId: user.id, action: "user.password_changed", entityType: "User", entityId: user.id });
  redirect("/dashboard?sandi=diubah");
}
