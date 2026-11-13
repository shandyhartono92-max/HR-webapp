import "server-only";
import { accountsDb } from "@/lib/accounts-db";
import { dbFor } from "@/lib/db";
import { sites, type SiteCode } from "@/lib/sites";
import type { Role } from "@/generated/prisma/enums";
import type { LoginEventKind } from "@/generated/accounts/enums";

// The link between the accounts database and the location databases. Each location
// keeps a password-less mirror of an account in its `user` table (same id), so its
// relations (employee login, interviewer, audit, letters, …) keep working.

// Brings one location's mirror in line with the account and its access there.
// Without access the mirror stays (its history needs it) but is inactive.
export async function syncMirror(accountId: string, site: SiteCode): Promise<void> {
  const db = dbFor(site);
  const account = await accountsDb.account.findUnique({
    where: { id: accountId },
    select: { email: true, name: true, isActive: true, access: { where: { site }, select: { role: true } } },
  });
  if (!account) {
    await db.user.updateMany({ where: { id: accountId }, data: { isActive: false } });
    return;
  }
  const access = account.access[0];
  const existing = await db.user.findUnique({ where: { id: accountId }, select: { id: true } });
  if (!access && !existing) return; // never entered this location, nothing to keep

  // Emails are unique in the accounts database, so another mirror with this email is
  // left over from an account that has since changed its email: move it aside
  await db.user.updateMany({
    where: { email: account.email, id: { not: accountId } },
    data: { email: `lama-${Date.now()}-${accountId}@ganti.invalid` },
  });

  const shared = { email: account.email, name: account.name, isActive: account.isActive && Boolean(access) };
  if (existing) {
    await db.user.update({ where: { id: accountId }, data: access ? { ...shared, role: access.role as Role } : shared });
  } else {
    await db.user.create({ data: { id: accountId, ...shared, role: access!.role as Role } });
  }
}

// Every location the account has access to or has a mirror in. A location whose
// database is down is skipped and named in the result; its mirror catches up on the
// account's next login there.
export async function syncMirrorEverywhere(accountId: string): Promise<{ failed: SiteCode[] }> {
  const failed: SiteCode[] = [];
  for (const { code } of sites()) {
    try {
      await syncMirror(accountId, code);
    } catch (e) {
      console.error(`[akun] salinan akun di ${code} gagal diperbarui:`, e instanceof Error ? e.message : e);
      failed.push(code);
    }
  }
  return { failed };
}

// Gives, changes (role) or removes (null) access to a location, then updates that
// location's mirror at once, so a new HR user shows up in pickers before they log in.
export async function setAccess(accountId: string, site: SiteCode, role: Role | null): Promise<void> {
  if (role) {
    await accountsDb.siteAccess.upsert({
      where: { accountId_site: { accountId, site } },
      update: { role },
      create: { accountId, site, role },
    });
  } else {
    await accountsDb.siteAccess.deleteMany({ where: { accountId, site } });
  }
  await syncMirror(accountId, site);
}

// A login, logout, location switch or failed attempt. Never stores the email or password.
export async function logLogin(kind: LoginEventKind, accountId: string | null, site: SiteCode | null): Promise<void> {
  try {
    await accountsDb.loginEvent.create({ data: { kind, accountId, site } });
  } catch (e) {
    // The log must never block someone from signing in or out
    console.error("[akun] log login gagal ditulis:", e instanceof Error ? e.message : e);
  }
}
