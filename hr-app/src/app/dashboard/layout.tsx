import { Suspense } from "react";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { requireUser } from "@/lib/dal";
import { countEndingContracts } from "@/lib/contracts";
import { initials, navGroupsFor } from "@/lib/nav";
import { MenuButton, NavDrawerProvider, NavLinks, Sidebar } from "@/app/ui/nav-drawer";
import { roleLabel } from "@/lib/labels";
import { currentSite } from "@/lib/db";
import { accountsDb } from "@/lib/accounts-db";
import { sites } from "@/lib/sites";
import { SiteSwitch } from "@/app/ui/site-switch";

// Every dashboard page depends on the logged-in user, so navigations are
// allowed to wait for the session check instead of showing a cached shell.
// Each page.tsx under /dashboard sets this too; new pages must as well.
export const instant = false;

function Logo({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-lg bg-brand-700 font-bold text-white ${small ? "size-7 text-xs" : "size-[34px] text-[15px]"}`}
    >
      HR
    </span>
  );
}

// The frame is static; parts that read the session stream in behind <Suspense>.
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <NavDrawerProvider>
      <div className="flex flex-1">
        <Sidebar>
          <Link href="/dashboard" className="flex items-center gap-2.5 px-6 pb-3 pt-5">
            <Logo />
            <span className="text-base font-bold tracking-wide text-white">Portal HR</span>
          </Link>
          <Suspense fallback={<div className="h-10" />}>
            <SideNav />
          </Suspense>
        </Sidebar>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-7">
            <MenuButton />
            <Link href="/dashboard" className="flex items-center gap-2 font-bold text-slate-900 md:hidden">
              <Logo small />
              Portal HR
            </Link>
            <div className="ml-auto flex items-center gap-2 sm:gap-4">
              <Suspense>
                <SiteMenu />
              </Suspense>
              <Suspense>
                <UserMenu />
              </Suspense>
            </div>
          </header>
          <main className="min-w-0 flex-1 p-4 sm:p-7">{children}</main>
        </div>
      </div>
    </NavDrawerProvider>
  );
}

async function SideNav() {
  const user = await requireUser({ allowPasswordChange: true });
  // Only serializable fields cross to the client component; roles stay on the server
  const groups = navGroupsFor(user.role).map((g) => ({
    title: g.title,
    items: g.items.map(({ href, label, icon }) => ({ href, label, icon })),
  }));
  // Alert badge on "Karyawan" for contracts ending within 6 weeks
  const badges: Record<string, number> = {};
  if (user.role === "ADMIN" || user.role === "HR") badges["/dashboard/karyawan"] = await countEndingContracts();

  return <NavLinks groups={groups} badges={badges} />;
}

// The active location, and the other locations this account may switch to
async function SiteMenu() {
  const user = await requireUser({ allowPasswordChange: true });
  const current = await currentSite();
  const access = await accountsDb.siteAccess.findMany({ where: { accountId: user.id }, select: { site: true } });
  const others = sites()
    .filter((s) => s.code !== current.code && access.some((a) => a.site === s.code))
    .map((s) => ({ code: s.code, label: s.label }));
  return <SiteSwitch current={{ code: current.code, label: current.label }} others={others} />;
}

async function UserMenu() {
  const user = await requireUser({ allowPasswordChange: true });

  return (
    <>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid size-9 place-items-center rounded-full bg-brand-700 text-[13px] font-bold text-white"
        >
          {initials(user.name)}
        </span>
        <div className="hidden sm:block">
          <p className="text-[13px] font-semibold leading-tight text-slate-900">{user.name}</p>
          <p className="text-xs text-slate-500">{roleLabel[user.role]}</p>
        </div>
      </div>
      <form action={logout}>
        <button type="submit" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          Keluar
        </button>
      </form>
    </>
  );
}
