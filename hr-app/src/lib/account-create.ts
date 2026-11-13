import "server-only";
import { accountsDb } from "@/lib/accounts-db";
import { setAccess } from "@/lib/site-access";
import { Prisma as AccountsPrisma } from "@/generated/accounts/client";
import type { SiteCode } from "@/lib/sites";
import type { Role } from "@/generated/prisma/enums";

// A new staff account with access to one location. If the access cannot be given (the
// location's database is down), the account is removed again, so a retry is not told
// "Email ini sudah dipakai" by an account nobody can use. Checked by scripts/check-account-create.mts.

type Grant = (accountId: string, site: SiteCode, role: Role | null) => Promise<void>;
export type CreateResult = { ok: true; id: string } | { ok: false; reason: "taken" | "site" };

export async function createAccountWithAccess(
  data: { name: string; email: string; passwordHash: string },
  site: SiteCode,
  role: Role,
  grant: Grant = setAccess,
): Promise<CreateResult> {
  let id: string;
  try {
    ({ id } = await accountsDb.account.create({ data: { ...data, mustChangePassword: true }, select: { id: true } }));
  } catch (e) {
    if (e instanceof AccountsPrisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, reason: "taken" };
    throw e;
  }
  try {
    await grant(id, site, role);
  } catch (e) {
    console.error(`[akun] akses ${site} gagal diberikan, akun baru dibatalkan:`, e instanceof Error ? e.message : e);
    // Cascades to its SiteAccess rows (if any were written)
    await accountsDb.account.delete({ where: { id } }).catch(() => {});
    return { ok: false, reason: "site" };
  }
  return { ok: true, id };
}
