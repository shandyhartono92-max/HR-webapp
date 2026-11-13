import type { PrismaClient as AccountsClient } from "@/generated/accounts/client";
import type { SiteCode } from "@/lib/sites";

// One-off move (scripts/split-accounts.mts): every user of a location database becomes
// an Account with the same id, password hash and flags, plus access to that location
// with the user's role. Safe to run again: existing accounts and access are left alone.
// Checked by scripts/check-split-accounts.mts.

export type SourceUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "HR" | "HIRING_MANAGER" | "EMPLOYEE";
  passwordHash: string;
  mustChangePassword: boolean;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

// Just what is read from the location database, so the check can pass plain data
type Source = { user: { findMany(args: { select: Record<keyof SourceUser, true> }): Promise<SourceUser[]> } };

export async function splitAccounts(from: Source, to: AccountsClient, site: SiteCode) {
  const users = await from.user.findMany({
    select: { id: true, email: true, name: true, role: true, passwordHash: true, mustChangePassword: true, isActive: true, lastLoginAt: true, createdAt: true },
  });
  const existingIds = new Set((await to.account.findMany({ where: { id: { in: users.map((u) => u.id) } }, select: { id: true } })).map((a) => a.id));

  let copied = 0;
  for (const u of users) {
    if (!existingIds.has(u.id)) {
      const { role, ...account } = u;
      void role;
      await to.account.create({ data: account });
      copied++;
    }
    await to.siteAccess.upsert({
      where: { accountId_site: { accountId: u.id, site } },
      update: {},
      create: { accountId: u.id, site, role: u.role },
    });
  }
  return { copied, existing: users.length - copied, total: users.length };
}
