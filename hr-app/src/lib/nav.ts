import type { Role } from "@/generated/prisma/enums";

// Sidebar navigation. Plain data and pure functions so the role rules can be
// checked without a browser (scripts/check-nav.mts).

export type NavIconName = "home" | "brief" | "users" | "db" | "badge" | "doc" | "bank" | "key" | "user" | "audit" | "cal";
export type NavItem = { href?: string; label: string; icon: NavIconName; roles: Role[] };
export type NavGroup = { title: string; items: NavItem[] };

const ALL: Role[] = ["ADMIN", "HR", "HIRING_MANAGER", "EMPLOYEE"];
const RECRUITERS: Role[] = ["ADMIN", "HR", "HIRING_MANAGER"];
const HR_ONLY: Role[] = ["ADMIN", "HR"];

// Items without href are modules planned for later phases
const NAV: NavGroup[] = [
  { title: "Utama", items: [{ href: "/dashboard", label: "Ringkasan", icon: "home", roles: ALL }] },
  {
    title: "Rekrutmen",
    items: [
      { href: "/dashboard/lowongan", label: "Lowongan", icon: "brief", roles: RECRUITERS },
      { href: "/dashboard/kandidat", label: "Kandidat", icon: "users", roles: RECRUITERS },
      { href: "/dashboard/kandidat/bank", label: "Bank Kandidat", icon: "db", roles: HR_ONLY },
    ],
  },
  {
    title: "Karyawan",
    items: [
      { href: "/dashboard/karyawan", label: "Karyawan", icon: "badge", roles: HR_ONLY },
      { href: "/dashboard/surat", label: "Surat", icon: "doc", roles: HR_ONLY },
      { href: "/dashboard/rekening", label: "Rekening Gaji", icon: "bank", roles: ALL },
    ],
  },
  {
    title: "Pengaturan",
    items: [
      { href: "/dashboard/pengguna", label: "Pengguna", icon: "key", roles: ["ADMIN"] },
      { label: "Log Audit", icon: "audit", roles: HR_ONLY },
      { href: "/dashboard/akun", label: "Akun Saya", icon: "user", roles: ALL },
    ],
  },
];

export function navGroupsFor(role: Role): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter((g) => g.items.length > 0);
}

// The menu entry to highlight: the longest href that is the path or a parent of it.
// "/dashboard" itself only matches exactly, otherwise it would win on every page.
export function activeHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    const hit = href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
    if (hit && (!best || href.length > best.length)) best = href;
  }
  return best;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return letters.toUpperCase();
}
