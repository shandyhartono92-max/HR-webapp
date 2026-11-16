import "server-only";
import bcrypt from "bcryptjs";
import * as z from "zod";
import { accountsDb } from "@/lib/accounts-db";
import { dbFor } from "@/lib/db";
import { temporaryPassword } from "@/lib/passwords";
import { setAccess } from "@/lib/site-access";
import { sites, type SiteCode } from "@/lib/sites";
import { Prisma as AccountsPrisma } from "@/generated/accounts/client";
import type { Role } from "@/generated/prisma/enums";

// The first Admin on a new server (npm run admin:create): ADMIN in every location, with a
// temporary password that must be changed at the first login. Unlike prisma/seed.ts it
// adds no demo data. If a location cannot be reached, the account and the mirrors already
// written are removed again, so the command can simply be run again.
// Checked by scripts/check-first-admin.mts.

type Grant = (accountId: string, site: SiteCode, role: Role | null) => Promise<void>;
export type FirstAdminResult =
  | { ok: true; id: string; email: string; password: string }
  | { ok: false; reason: "invalid" | "taken" }
  | { ok: false; reason: "site"; site: SiteCode };

const Input = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: z.string().trim().min(2).max(120),
});

export async function createFirstAdmin(input: { email: string; name: string }, grant: Grant = setAccess): Promise<FirstAdminResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { email, name } = parsed.data;

  const password = temporaryPassword(12);
  let id: string;
  try {
    ({ id } = await accountsDb.account.create({
      data: { email, name, passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true },
      select: { id: true },
    }));
  } catch (e) {
    if (e instanceof AccountsPrisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, reason: "taken" };
    throw e;
  }

  for (const { code } of sites()) {
    try {
      await grant(id, code, "ADMIN");
    } catch {
      // Brand new, so nothing refers to these rows yet
      await accountsDb.account.delete({ where: { id } }).catch(() => {});
      for (const s of sites()) await dbFor(s.code).user.deleteMany({ where: { id } }).catch(() => {});
      return { ok: false, reason: "site", site: code };
    }
  }
  return { ok: true, id, email, password };
}
