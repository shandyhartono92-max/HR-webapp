import { Suspense } from "react";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { requireUser } from "@/lib/dal";
import { countEndingContracts } from "@/lib/contracts";
import { AlertIcon } from "@/app/ui/contract-alert";
import { roleLabel } from "@/lib/labels";
import type { Role } from "@/generated/prisma/enums";

type NavItem = { href?: string; label: string; roles: Role[] };

const ALL: Role[] = ["ADMIN", "HR", "HIRING_MANAGER", "EMPLOYEE"];
const RECRUITERS: Role[] = ["ADMIN", "HR", "HIRING_MANAGER"];
const HR_ONLY: Role[] = ["ADMIN", "HR"];

// Items without href are modules planned for later phases
const nav: NavItem[] = [
  { href: "/dashboard", label: "Ringkasan", roles: ALL },
  { href: "/dashboard/lowongan", label: "Lowongan", roles: RECRUITERS },
  { href: "/dashboard/kandidat", label: "Kandidat", roles: RECRUITERS },
  { href: "/dashboard/kandidat/bank", label: "Bank Kandidat", roles: HR_ONLY },
  { href: "/dashboard/karyawan", label: "Karyawan", roles: HR_ONLY },
  { href: "/dashboard/surat", label: "Surat", roles: HR_ONLY },
  { href: "/dashboard/rekening", label: "Rekening Gaji", roles: ALL },
  { href: "/dashboard/pengguna", label: "Pengguna", roles: ["ADMIN"] },
  { label: "Log Audit", roles: HR_ONLY },
  { href: "/dashboard/akun", label: "Akun Saya", roles: ALL },
];

// Every dashboard page depends on the logged-in user, so navigations are
// allowed to wait for the session check instead of showing a cached shell.
// Each page.tsx under /dashboard sets this too; new pages must as well.
export const instant = false;

// The frame is static; parts that read the session stream in behind <Suspense>.
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="border-b border-slate-200 bg-white md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="px-5 py-4">
          <p className="text-base font-semibold text-teal-800">Portal HR</p>
        </div>
        <Suspense fallback={<div className="h-10 px-3" />}>
          <SideNav />
        </Suspense>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex min-h-[61px] items-center justify-end gap-4 border-b border-slate-200 bg-white px-6 py-3">
          <Suspense>
            <UserMenu />
          </Suspense>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

async function SideNav() {
  const user = await requireUser({ allowPasswordChange: true });
  const items = nav.filter((item) => item.roles.includes(user.role));
  // Alert badge on "Karyawan" for contracts ending within 6 weeks
  const badges: Record<string, number> = {};
  if (user.role === "ADMIN" || user.role === "HR") badges["/dashboard/karyawan"] = await countEndingContracts();

  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
      {items.map((item) =>
        item.href ? (
          <Link
            key={item.label}
            href={item.href}
            className="flex items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            {item.label}
            {badges[item.href] ? (
              <span
                title={`${badges[item.href]} kontrak berakhir dalam 6 minggu`}
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
              >
                <AlertIcon />
                {badges[item.href]}
              </span>
            ) : null}
          </Link>
        ) : (
          <span
            key={item.label}
            className="flex items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm text-slate-400"
          >
            {item.label}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Segera</span>
          </span>
        ),
      )}
    </nav>
  );
}

async function UserMenu() {
  const user = await requireUser({ allowPasswordChange: true });

  return (
    <>
      <div className="text-right">
        <p className="text-sm font-medium text-slate-900">{user.name}</p>
        <p className="text-xs text-slate-500">{roleLabel[user.role]}</p>
      </div>
      <form action={logout}>
        <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          Keluar
        </button>
      </form>
    </>
  );
}
