import "server-only";
import { dbFor } from "@/lib/db";
import { sites, type SiteCode } from "@/lib/sites";

// The employee records an account is linked to, in every location. Kelola pengguna is
// opened from one location but manages the account everywhere, so its rules (name and
// email follow the employee record; a leaver's login stays off) look at all of them.
// A location whose database is down is skipped. Checked by scripts/check-account-links.mts.

export type EmployeeLink = { site: SiteCode; status: string; anonymizedAt: Date | null };

const LEFT = ["RESIGNED", "TERMINATED", "CONTRACT_ENDED"];

export async function employeeLinks(accountId: string): Promise<EmployeeLink[]> {
  const found = await Promise.all(
    sites().map(async (s) => {
      const e = await dbFor(s.code)
        .employee.findFirst({ where: { userId: accountId }, select: { status: true, anonymizedAt: true } })
        .catch(() => null);
      return e ? ({ site: s.code, status: e.status as string, anonymizedAt: e.anonymizedAt } satisfies EmployeeLink) : null;
    }),
  );
  return found.filter((x) => x !== null);
}

export function linkSummary(links: EmployeeLink[]) {
  return {
    linked: links.length > 0,
    anonymized: links.some((l) => l.anonymizedAt),
    // Left in every location it works in (a login for someone still working stays possible)
    allLeft: links.length > 0 && links.every((l) => LEFT.includes(l.status)),
  };
}
