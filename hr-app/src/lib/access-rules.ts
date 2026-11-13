import type { SiteCode } from "@/lib/sites";

// Pure rules about which locations an account may enter. Checked by
// scripts/check-site-access.mts; the database side lives in src/lib/site-access.ts.

type Access = { accountId: string; site: SiteCode; role: string };

// An Admin may not give up their own last ADMIN access (in any location), so the
// portal always keeps someone who can manage accounts. Judged on the access as it
// will be after every change of one save. Other accounts are not covered here.
export function lastAdminError(access: Access[], changes: { accountId: string; site: SiteCode; role: string | null }[], actorId: string): string | null {
  const isAdmin = (rows: { accountId: string; role: string | null }[]) => rows.some((a) => a.accountId === actorId && a.role === "ADMIN");
  const mine = changes.filter((c) => c.accountId === actorId);
  if (mine.length === 0 || !isAdmin(access)) return null;
  const after = [
    ...access.filter((a) => !(a.accountId === actorId && mine.some((c) => c.site === a.site))),
    ...mine.filter((c) => c.role !== null),
  ];
  return isAdmin(after) ? null : "Tidak bisa mencabut akses ADMIN terakhir milik Anda sendiri.";
}

// Null when the account may enter `wanted`. Only shown after the password is proven,
// so it tells nothing to someone who does not know the password.
export function accessError(access: { site: SiteCode }[], wanted: SiteCode, labelOf: (code: SiteCode) => string): string | null {
  if (access.some((a) => a.site === wanted)) return null;
  const message = `Akun ini tidak punya akses ke ${labelOf(wanted)}.`;
  return access.length === 1 ? `${message} Akun ini terdaftar di ${labelOf(access[0].site)}.` : message;
}
