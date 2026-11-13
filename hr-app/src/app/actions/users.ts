"use server";

import bcrypt from "bcryptjs";
import { refresh } from "next/cache";
import * as z from "zod";
import { currentSite, dbFor, siteDb } from "@/lib/db";
import { formSiteRefusal } from "@/lib/form-site";
import { siteByCode, sites, type SiteCode } from "@/lib/sites";
import { lastAdminError, siteWithoutAdminError } from "@/lib/access-rules";
import { accountsDb } from "@/lib/accounts-db";
import { setAccess, syncMirrorEverywhere } from "@/lib/site-access";
import { createAccountWithAccess } from "@/lib/account-create";
import { employeeLinks, linkSummary } from "@/lib/account-links";
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
  const db = await siteDb();
  const admin = await requireRole("ADMIN");
  const moved = await formSiteRefusal(formData);
  if (moved) return { message: moved, attempt: Date.now() };

  const parsed = CreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);
  const d = parsed.data;

  // Emails are unique across every location: the account lives in the accounts database
  const taken = await accountsDb.account.findFirst({ where: { email: equalsIgnoringCase(d.email) }, select: { id: true } });
  if (taken) return failed(formData, { email: ["Email ini sudah dipakai akun lain."] });

  const tempPassword = temporaryPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  // The account and its access to this location (the mirror user is created here before
  // linking to it); undone if the location cannot be reached, so a retry works
  const site = await currentSite();
  const created = await createAccountWithAccess({ name: d.name, email: d.email, passwordHash }, site.code, d.role);
  if (!created.ok && created.reason === "taken") return failed(formData, { email: ["Email ini sudah dipakai akun lain."] });
  if (!created.ok) return failed(formData, undefined, `Lokasi ${site.label} sedang tidak bisa diakses, akun belum dibuat. Coba lagi nanti.`);
  const account = { id: created.id };
  const result = await db.$transaction(async (tx) => ({
    id: account.id,
    linkedEmployee: await linkEmployeeByEmail(tx, account.id, d.email),
    linkedJobs: await linkJobsByName(tx, account.id, d.name, d.role),
  }));

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

// Access rows of active accounts (for the "every location keeps an Admin" rule)
const activeAccess = () =>
  accountsDb.siteAccess.findMany({ where: { account: { isActive: true } }, select: { accountId: true, site: true, role: true } });

// The account, with its role and linked employee in the current location (null role:
// no access here). Accounts are managed from any location.
async function manageable(id: string) {
  const account = await accountsDb.account.findUnique({ where: { id }, select: { id: true, name: true, email: true, isActive: true } });
  if (!account) return null;
  const mirror = await (await siteDb()).user.findUnique({
    where: { id },
    select: { role: true, isActive: true, employee: { select: { status: true, anonymizedAt: true } } },
  });
  // Employee records in every location decide the rules below, not only this one's
  const links = linkSummary(await employeeLinks(id));
  return { ...account, role: mirror?.isActive ? mirror.role : null, employee: mirror?.employee ?? null, links };
}

const UpdateSchema = z.object(NameEmail);

export async function updateUser(userId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const db = await siteDb();
  const admin = await requireRole("ADMIN");
  const before = await manageable(userId);
  if (!before) return { message: "Akun tidak ditemukan." };
  if (before.links.anonymized) return { message: "Data akun ini sudah dianonimkan." };

  const parsed = UpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);
  const d = parsed.data;

  // A linked account's name and email follow the employee record (Ubah identitas)
  if (before.links.linked && (d.name !== before.name || d.email !== before.email)) {
    return failed(formData, undefined, "Nama dan email akun ini mengikuti data karyawan. Ubah lewat profil karyawan → Ubah identitas.");
  }
  const taken = await accountsDb.account.findFirst({ where: { email: equalsIgnoringCase(d.email), id: { not: userId } }, select: { id: true } });
  if (taken) return failed(formData, { email: ["Email ini sudah dipakai akun lain."] });

  // Name and email belong to the account and show in every location it can enter
  await accountsDb.account.update({ where: { id: userId }, data: { name: d.name, email: d.email } });
  await syncMirrorEverywhere(userId);
  // Links to employee records and jobs need the account in this location
  const role = before.role;
  const links = role
    ? await db.$transaction(async (tx) => {
        // Jobs show the manager's name as text; keep it in step with the account
        if (d.name !== before.name) await tx.job.updateMany({ where: { hiringManagerId: userId }, data: { hiringManagerName: d.name } });
        return {
          linkedEmployee: !before.employee && d.email !== before.email ? await linkEmployeeByEmail(tx, userId, d.email) : null,
          linkedJobs: d.name !== before.name ? await linkJobsByName(tx, userId, d.name, role) : 0,
        };
      })
    : { linkedEmployee: null, linkedJobs: 0 };

  // Name and email are recorded without their values: the audit log can never be wiped
  const changes: Record<string, unknown> = {};
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

// Access per location: one select per location, value = role or "" for no access.
// Refuses the actor's own last ADMIN access, and Karyawan where the account is not
// linked to an employee record of that location.
export async function setUserAccess(accountId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole("ADMIN");
  const account = await accountsDb.account.findUnique({ where: { id: accountId }, select: { id: true, access: { select: { site: true, role: true } } } });
  if (!account) return { message: "Akun tidak ditemukan." };

  const all = await accountsDb.siteAccess.findMany({ where: { accountId: { in: [accountId, admin.id] } }, select: { accountId: true, site: true, role: true } });
  const errors: Record<string, string[]> = {};
  const changes: { site: SiteCode; label: string; from: Role | null; to: Role | null }[] = [];
  for (const site of sites()) {
    const raw = String(formData.get(site.code) ?? "");
    if (raw && !(raw in Role)) {
      errors[site.code] = ["Pilih peran."];
      continue;
    }
    const to = (raw || null) as Role | null;
    const from = (account.access.find((a) => a.site === site.code)?.role ?? null) as Role | null;
    if (to === from) continue;
    if (to === "EMPLOYEE") {
      const linked = await dbFor(site.code)
        .employee.findFirst({ where: { userId: accountId }, select: { id: true } })
        .catch(() => undefined);
      if (linked === undefined) {
        errors[site.code] = [`Lokasi ${site.label} sedang tidak bisa diakses.`];
        continue;
      }
      if (!linked) {
        errors[site.code] = [`Peran Karyawan hanya untuk akun yang terhubung ke data karyawan di ${site.label}.`];
        continue;
      }
    }
    changes.push({ site: site.code, label: site.label, from, to });
  }
  // Judged on all of this save's changes together
  const asChanges = changes.map((c) => ({ accountId, site: c.site, role: c.to }));
  const lastAdmin = lastAdminError(all, asChanges, admin.id);
  if (lastAdmin) for (const c of changes) if (c.from === "ADMIN") errors[c.site] = [lastAdmin];
  // …and no location may be left without an Admin, whoever's access changes
  const siteAdmin = siteWithoutAdminError(await activeAccess(), asChanges, (code) => siteByCode(code)?.label ?? code);
  if (siteAdmin) for (const c of changes) if (c.from === "ADMIN") errors[c.site] ??= [siteAdmin];
  if (Object.keys(errors).length) return failed(formData, errors);

  const failedSites: string[] = [];
  for (const c of changes) {
    try {
      await setAccess(accountId, c.site, c.to);
    } catch (e) {
      console.error(`[akses] ${c.site} gagal:`, e instanceof Error ? e.message : e);
      failedSites.push(c.label);
    }
  }
  if (changes.length) {
    await writeAudit({
      actorId: admin.id,
      action: "user.access_changed",
      entityType: "User",
      entityId: accountId,
      changes: Object.fromEntries(changes.map((c) => [c.site, { from: c.from, to: c.to }])),
    });
  }
  refresh();
  if (failedSites.length) {
    // The access itself is saved (and enforced at once); only the location's copy of the account waits
    return {
      message: `Akses tersimpan, tetapi data akun di ${failedSites.join(", ")} belum diperbarui karena lokasinya sedang tidak bisa diakses. Pencabutan akses tetap langsung berlaku; nama di daftar pilihan lokasi itu menyusul saat orangnya masuk ke sana.`,
      attempt: Date.now(),
    };
  }
  return { ok: true, attempt: Date.now() };
}

export type PasswordResult = { error?: string; tempPassword?: string; email?: string };

// Your own password is changed under Akun Saya, which asks for the current one
export async function resetUserPassword(userId: string): Promise<PasswordResult> {
  const admin = await requireRole("ADMIN");
  if (userId === admin.id) return { error: "Ganti kata sandi Anda sendiri lewat menu Akun Saya." };
  const user = await manageable(userId);
  if (!user || user.links.anonymized) return { error: "Akun tidak ditemukan." };

  const tempPassword = temporaryPassword();
  await accountsDb.account.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(tempPassword, 12), mustChangePassword: true } });
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
    if (user.links.anonymized) return { error: "Data akun ini sudah dianonimkan dan tidak bisa diaktifkan lagi." };
    if (user.links.allLeft) {
      return { error: "Karyawan ini sudah keluar. Ubah dulu statusnya di profil karyawan jika ia bekerja lagi." };
    }
  } else {
    // Switching the account off removes it from every location at once
    const access = await activeAccess();
    const gone = access.filter((a) => a.accountId === userId).map((a) => ({ accountId: userId, site: a.site, role: null }));
    const siteAdmin = siteWithoutAdminError(access, gone, (code) => siteByCode(code)?.label ?? code);
    if (siteAdmin) return { error: siteAdmin };
  }

  // The whole account, in every location
  await accountsDb.account.update({ where: { id: userId }, data: { isActive: active } });
  await syncMirrorEverywhere(userId);
  await writeAudit({ actorId: admin.id, action: active ? "user.reactivated" : "user.deactivated", entityType: "User", entityId: userId });
  refresh();
  return {};
}
