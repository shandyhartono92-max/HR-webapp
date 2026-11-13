"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import * as z from "zod";
import { accountsDb } from "@/lib/accounts-db";
import { createSession, deleteSession } from "@/lib/session";
import { getCurrentUser } from "@/lib/dal";
import { currentSite } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { LAST_SITE_COOKIE, siteByCode } from "@/lib/sites";
import { withSite } from "@/lib/site-context";
import { accessError } from "@/lib/access-rules";
import { logLogin, syncMirror } from "@/lib/site-access";
import type { Role } from "@/generated/prisma/enums";

const LoginSchema = z.object({
  site: z.string().refine((v) => siteByCode(v) !== null, { error: "Pilih lokasi." }),
  email: z.email({ error: "Masukkan email yang valid." }).trim().toLowerCase(),
  password: z.string().min(1, { error: "Kata sandi wajib diisi." }),
});

export type LoginState = { error?: string; email?: string; site?: string } | undefined;

const labelOf = (code: string) => siteByCode(code)?.label ?? code;

// Email and password are checked in the accounts database; then access to the chosen
// location, and that location's copy of the account is brought up to date.
export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const raw = { site: String(formData.get("site") ?? ""), email: String(formData.get("email") ?? "") };
  const parsed = LoginSchema.safeParse({ ...raw, password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, ...raw };
  const { site, email, password } = parsed.data;

  const account = await accountsDb.account.findUnique({
    where: { email },
    select: { id: true, isActive: true, passwordHash: true, access: { select: { site: true, role: true } } },
  });
  // Same message for unknown email and wrong password
  const ok = account?.isActive && (await bcrypt.compare(password, account.passwordHash));
  if (!account || !ok) {
    await logLogin("FAILED", account?.id ?? null, site);
    return { error: "Email atau kata sandi salah.", email, site };
  }

  const refused = accessError(account.access, site, labelOf);
  if (refused) {
    await logLogin("FAILED", account.id, site);
    return { error: refused, email, site };
  }

  try {
    await syncMirror(account.id, site);
    await withSite(site, () => writeAudit({ actorId: account.id, action: "auth.login", entityType: "User", entityId: account.id }));
  } catch (e) {
    // This location's database is down; the others are not affected
    console.error(`[login] lokasi ${site} tidak bisa diakses:`, e instanceof Error ? e.message : e);
    return { error: `Lokasi ${labelOf(site)} sedang tidak bisa diakses. Coba lagi nanti.`, email, site };
  }

  await accountsDb.account.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });
  await logLogin("LOGIN", account.id, site);
  const role = account.access.find((a) => a.site === site)!.role as Role;
  await createSession({ userId: account.id, role, site });
  (await cookies()).set(LAST_SITE_COOKIE, site, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard");
}

export async function logout() {
  const user = await getCurrentUser();
  if (user) {
    const site = (await currentSite()).code;
    await writeAudit({ actorId: user.id, action: "auth.logout", entityType: "User", entityId: user.id });
    await logLogin("LOGOUT", user.id, site);
  }
  await deleteSession();
  redirect("/login");
}
