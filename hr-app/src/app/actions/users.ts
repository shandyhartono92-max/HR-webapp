"use server";

import bcrypt from "bcryptjs";
import { refresh } from "next/cache";
import * as z from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { failed, type FormState } from "@/lib/forms";
import { equalsIgnoringCase } from "@/lib/match";
import { temporaryPassword } from "@/lib/passwords";
import { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";

// User management, Admin only: an HR user who could create accounts could also make
// themselves a second account and approve their own bank change.

export type UserFormState =
  | (NonNullable<FormState> & { tempPassword?: string; email?: string; linkedEmployee?: string | null; linkedJobs?: number })
  | undefined;

type Tx = Prisma.TransactionClient;

const STAFF_ROLES = ["ADMIN", "HR", "HIRING_MANAGER"] as const;

const NameEmail = {
  name: z.string().trim().min(3, { error: "Nama minimal 3 karakter." }).max(120),
  email: z.email({ error: "Masukkan email yang valid." }).trim().toLowerCase(),
};

const CreateSchema = z.object({ ...NameEmail, role: z.enum(STAFF_ROLES, { error: "Pilih peran." }) });

// A staff member who is also an employee must be linked to their record: the rule
// "nobody approves their own bank change" compares the login with the employee's login.
async function linkEmployeeByEmail(tx: Tx, userId: string, email: string) {
  const employee = await tx.employee.findFirst({
    where: { email: equalsIgnoringCase(email), userId: null, anonymizedAt: null },
    select: { id: true, employeeNumber: true },
  });
  if (!employee) return null;
  await tx.employee.update({ where: { id: employee.id }, data: { userId } });
  return employee.employeeNumber;
}

// Jobs where HR typed this person's name before the account existed. Skipped if
// another active staff account has the same name, since the jobs could be theirs.
async function linkJobsByName(tx: Tx, userId: string, name: string, role: Role) {
  if (role === "EMPLOYEE") return 0;
  const namesake = await tx.user.findFirst({
    where: { id: { not: userId }, name: equalsIgnoringCase(name), isActive: true, role: { in: [...STAFF_ROLES] } },
    select: { id: true },
  });
  if (namesake) return 0;
  const jobs = await tx.job.updateMany({
    where: { hiringManagerId: null, hiringManagerName: equalsIgnoringCase(name) },
    data: { hiringManagerId: userId },
  });
  return jobs.count;
}

export async function createUser(_state: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireRole("ADMIN");

  const parsed = CreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);
  const d = parsed.data;

  const taken = await db.user.findFirst({ where: { email: equalsIgnoringCase(d.email) }, select: { id: true } });
  if (taken) return failed(formData, { email: ["Email ini sudah dipakai akun lain."] });

  const tempPassword = temporaryPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  let result: { id: string; linkedEmployee: string | null; linkedJobs: number };
  try {
    result = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: d.name, email: d.email, role: d.role, passwordHash, mustChangePassword: true },
        select: { id: true },
      });
      return {
        id: user.id,
        linkedEmployee: await linkEmployeeByEmail(tx, user.id, d.email),
        linkedJobs: await linkJobsByName(tx, user.id, d.name, d.role),
      };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return failed(formData, { email: ["Email ini sudah dipakai akun lain."] });
    }
    throw e;
  }

  await writeAudit({
    actorId: admin.id,
    action: "user.created",
    entityType: "User",
    entityId: result.id,
    changes: { role: d.role, linkedEmployee: result.linkedEmployee, linkedJobs: result.linkedJobs },
  });
  refresh();
  return {
    ok: true,
    tempPassword,
    email: d.email,
    linkedEmployee: result.linkedEmployee,
    linkedJobs: result.linkedJobs,
    attempt: Date.now(),
  };
}

const manageable = (id: string) =>
  db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      employee: { select: { status: true, anonymizedAt: true } },
    },
  });

const UpdateSchema = z.object({ ...NameEmail, role: z.enum(Role, { error: "Pilih peran." }) });

export async function updateUser(userId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole("ADMIN");
  const before = await manageable(userId);
  if (!before) return { message: "Akun tidak ditemukan." };
  if (before.employee?.anonymizedAt) return { message: "Data akun ini sudah dianonimkan." };

  const parsed = UpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);
  const d = parsed.data;

  // An Admin cannot demote or deactivate themselves, so one working Admin always remains
  if (userId === admin.id && d.role !== before.role) return failed(formData, { role: ["Anda tidak bisa mengubah peran Anda sendiri."] });
  if (d.role === "EMPLOYEE" && !before.employee) {
    return failed(formData, { role: ["Peran Karyawan hanya untuk akun yang terhubung ke data karyawan."] });
  }
  // A linked account's name and email follow the employee record (Ubah identitas)
  if (before.employee && (d.name !== before.name || d.email !== before.email)) {
    return failed(formData, undefined, "Nama dan email akun ini mengikuti data karyawan. Ubah lewat profil karyawan → Ubah identitas.");
  }
  const taken = await db.user.findFirst({ where: { email: equalsIgnoringCase(d.email), id: { not: userId } }, select: { id: true } });
  if (taken) return failed(formData, { email: ["Email ini sudah dipakai akun lain."] });

  const links = await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { name: d.name, email: d.email, role: d.role } });
    // Jobs show the manager's name as text; keep it in step with the account
    if (d.name !== before.name) await tx.job.updateMany({ where: { hiringManagerId: userId }, data: { hiringManagerName: d.name } });
    return {
      linkedEmployee: !before.employee && d.email !== before.email ? await linkEmployeeByEmail(tx, userId, d.email) : null,
      linkedJobs: d.name !== before.name || d.role !== before.role ? await linkJobsByName(tx, userId, d.name, d.role) : 0,
    };
  });

  // Name and email are recorded without their values: the audit log can never be wiped
  const changes: Record<string, unknown> = {};
  if (d.role !== before.role) changes.role = { from: before.role, to: d.role };
  if (d.name !== before.name) changes.name = "changed";
  if (d.email !== before.email) changes.email = "changed";
  if (Object.keys(changes).length) {
    await writeAudit({
      actorId: admin.id,
      action: "user.updated",
      entityType: "User",
      entityId: userId,
      changes: { ...changes, ...links } as Prisma.InputJsonValue,
    });
  }
  refresh();
  return { ok: true, attempt: Date.now() };
}

export type PasswordResult = { error?: string; tempPassword?: string; email?: string };

// Your own password is changed under Akun Saya, which asks for the current one
export async function resetUserPassword(userId: string): Promise<PasswordResult> {
  const admin = await requireRole("ADMIN");
  if (userId === admin.id) return { error: "Ganti kata sandi Anda sendiri lewat menu Akun Saya." };
  const user = await manageable(userId);
  if (!user || user.employee?.anonymizedAt) return { error: "Akun tidak ditemukan." };

  const tempPassword = temporaryPassword();
  await db.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(tempPassword, 12), mustChangePassword: true } });
  await writeAudit({ actorId: admin.id, action: "user.password_reset", entityType: "User", entityId: userId });
  refresh();
  return { tempPassword, email: user.email };
}

export async function setUserActive(userId: string, active: boolean): Promise<{ error?: string }> {
  const admin = await requireRole("ADMIN");
  if (userId === admin.id) return { error: "Anda tidak bisa menonaktifkan akun Anda sendiri." };
  const user = await manageable(userId);
  if (!user) return { error: "Akun tidak ditemukan." };

  if (active) {
    if (user.employee?.anonymizedAt) return { error: "Data akun ini sudah dianonimkan dan tidak bisa diaktifkan lagi." };
    if (user.employee?.status === "RESIGNED" || user.employee?.status === "TERMINATED") {
      return { error: "Karyawan ini sudah keluar. Akunnya tidak bisa diaktifkan lagi." };
    }
  }

  await db.user.update({ where: { id: userId }, data: { isActive: active } });
  await writeAudit({ actorId: admin.id, action: active ? "user.reactivated" : "user.deactivated", entityType: "User", entityId: userId });
  refresh();
  return {};
}
