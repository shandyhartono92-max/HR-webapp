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

// Every location that has an Admin keeps at least one after one save's changes, whoever
// makes them (otherwise nobody could manage that location's accounts). `access` holds the
// rows of active accounts only.
export function siteWithoutAdminError(
  access: Access[],
  changes: { accountId: string; site: SiteCode; role: string | null }[],
  labelOf: (code: SiteCode) => string,
): string | null {
  const key = (a: { accountId: string; site: SiteCode }) => `${a.accountId}|${a.site}`;
  const changed = new Set(changes.map(key));
  const after = [...access.filter((a) => !changed.has(key(a))), ...changes.filter((c) => c.role !== null)];
  for (const site of new Set(changes.map((c) => c.site))) {
    const hadAdmin = access.some((a) => a.site === site && a.role === "ADMIN");
    const hasAdmin = after.some((a) => a.site === site && a.role === "ADMIN");
    if (hadAdmin && !hasAdmin) return `${labelOf(site)} harus punya minimal satu Admin aktif. Berikan peran Admin ke akun lain di ${labelOf(site)} dulu.`;
  }
  return null;
}

// HR creates and resets employee logins from the employee profile. That may only
// touch an account that is nothing more than an employee login of this location:
// linking (and then resetting) a staff account, or one of another location, would
// hand its temporary password to whoever typed the email. Admins may, as on Pengguna.
export function employeeLoginError(access: { site: SiteCode; role: string }[], site: SiteCode, actorRole: string): string | null {
  if (actorRole === "ADMIN") return null;
  const employeeHereOnly = access.every((a) => a.site === site && a.role === "EMPLOYEE");
  return employeeHereOnly ? null : "Email ini dipakai akun staf atau akun di lokasi lain. Hanya Admin yang bisa menghubungkannya, lewat menu Pengguna.";
}

// Forms carry the location they were opened in; a save after another tab switched
// location must not land in the other location's database
export function formSiteError(formSite: string | null, current: SiteCode): string | null {
  return formSite === current ? null : "Lokasi aktif sudah berganti ke tab lain. Muat ulang halaman ini, lalu isi lagi.";
}

// Null when the account may enter `wanted`. Only shown after the password is proven,
// so it tells nothing to someone who does not know the password.
export function accessError(access: { site: SiteCode }[], wanted: SiteCode, labelOf: (code: SiteCode) => string): string | null {
  if (access.some((a) => a.site === wanted)) return null;
  const message = `Akun ini tidak punya akses ke ${labelOf(wanted)}.`;
  return access.length === 1 ? `${message} Akun ini terdaftar di ${labelOf(access[0].site)}.` : message;
}
