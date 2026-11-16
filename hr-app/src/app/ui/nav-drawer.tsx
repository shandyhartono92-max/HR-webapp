"use client";

import { createContext, use, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeHref, type NavIconName } from "@/lib/nav";
import { MenuIcon, NavIcon } from "@/app/ui/icons";

// Client half of the dashboard sidebar: which link is active, and the phone drawer.
// Which items a role may see is decided on the server (dashboard/layout.tsx).

type Drawer = { open: boolean; setOpen: (open: boolean) => void };
const DrawerContext = createContext<Drawer>({ open: false, setOpen: () => {} });

export function NavDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [shownFor, setShownFor] = useState(pathname);

  // A navigation closes the drawer (state reset during render, not in an effect)
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // Widening past md (e.g. rotating a phone) shows the static sidebar and hides the
    // backdrop, so nothing would be left to close the drawer and unlock scrolling
    const wide = window.matchMedia("(min-width: 768px)");
    const onWide = () => wide.matches && setOpen(false);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  return <DrawerContext value={{ open, setOpen }}>{children}</DrawerContext>;
}

export function MenuButton() {
  const { open, setOpen } = use(DrawerContext);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Buka menu"
      aria-expanded={open}
      aria-controls="sidebar"
      className="grid size-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 md:hidden"
    >
      <MenuIcon />
    </button>
  );
}

export function Sidebar({ children }: { children: ReactNode }) {
  const { open, setOpen } = use(DrawerContext);
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Tutup menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/50 md:hidden"
        />
      )}
      {/* Any link tap closes it, including the page you are already on (no path change) */}
      <aside
        id="sidebar"
        onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col overflow-y-auto bg-[#0f2744] text-[#cbd5e1] transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {children}
      </aside>
    </>
  );
}

// Each alert count means something different per menu entry
function badgeTitle(href: string, count: number): string {
  if (href === "/dashboard/tka") return `${count} KITAS habis dalam 30 hari atau sudah lewat`;
  return `${count} kontrak berakhir dalam 6 minggu`;
}

export type NavLinkGroup ={ title: string; items: { href?: string; label: string; icon: NavIconName }[] };

export function NavLinks({ groups, badges }: { groups: NavLinkGroup[]; badges: Record<string, number> }) {
  const pathname = usePathname();
  const active = activeHref(
    pathname,
    groups.flatMap((g) => g.items.flatMap((i) => (i.href ? [i.href] : []))),
  );

  return (
    <nav className="flex flex-col gap-1 px-3 pb-4">
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-1">
          <p className="px-3 pb-1 pt-4 text-xs text-[#7c93b0]">{group.title}</p>
          {group.items.map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
                aria-current={item.href === active ? "page" : undefined}
                className={`flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 ${
                  item.href === active ? "bg-brand-700 font-medium text-white" : "hover:bg-white/5 hover:text-white"
                }`}
              >
                <NavIcon name={item.icon} />
                <span className="flex-1">{item.label}</span>
                {badges[item.href] ? (
                  <span
                    title={badgeTitle(item.href, badges[item.href])}
                    className="flex items-center gap-1.5 text-xs tabular-nums text-amber-300"
                  >
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-400" />
                    {badges[item.href]}
                  </span>
                ) : null}
              </Link>
            ) : (
              <span key={item.label} className="flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-[#7c93b0]">
                <NavIcon name={item.icon} />
                <span className="flex-1">{item.label}</span>
                <span className="text-xs">Segera</span>
              </span>
            ),
          )}
        </div>
      ))}
    </nav>
  );
}
