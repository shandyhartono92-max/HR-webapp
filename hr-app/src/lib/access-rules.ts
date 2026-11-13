import type { SiteCode } from "@/lib/sites";

// Pure rules about which locations an account may enter. Checked by
// scripts/check-site-access.mts; the database side lives in src/lib/site-access.ts.

// Null when the account may enter `wanted`. Only shown after the password is proven,
// so it tells nothing to someone who does not know the password.
export function accessError(access: { site: SiteCode }[], wanted: SiteCode, labelOf: (code: SiteCode) => string): string | null {
  if (access.some((a) => a.site === wanted)) return null;
  const message = `Akun ini tidak punya akses ke ${labelOf(wanted)}.`;
  return access.length === 1 ? `${message} Akun ini terdaftar di ${labelOf(access[0].site)}.` : message;
}
