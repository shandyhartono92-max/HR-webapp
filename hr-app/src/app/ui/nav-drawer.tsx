"use client";

import { createContext, use, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeHref, type NavIconName } from "@/lib/nav";
import { AlertIcon } from "@/app/ui/contract-alert";
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
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
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
      <aside
        id="sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col overflow-y-auto bg-[#0f2744] text-[#cbd5e1] transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {children}
      </aside>
    </>
  );
}

export type NavLinkGroup = { title: string; items: { href?: string; label: string; icon: NavIconName }[] };

export function NavLinks({ groups, badges }: { groups: NavLinkGroup[]; badges: Record<string, number> }) {
  const pathname = usePathname();
  const active = activeHref(
    pathname,
    groups.flatMap((g) => g.items.flatMap((i) => (i.href ? [i.href] : []))),
  );

  return (
    <nav className="flex flex-col gap-0.5 px-3.5 pb-4">
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-0.5">
          <p className="px-2.5 pb-1.5 pt-3.5 text-[10.5px] uppercase tracking-wider text-[#7c93b0]">{group.title}</p>
          {group.items.map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
                aria-current={item.href === active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${
                  item.href === active ? "bg-brand-700 font-semibold text-white" : "hover:bg-white/5 hover:text-white"
                }`}
              >
                <NavIcon name={item.icon} />
                <span className="flex-1">{item.label}</span>
                {badges[item.href] ? (
                  <span
                    title={`${badges[item.href]} kontrak berakhir dalam 6 minggu`}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"
                  >
                    <AlertIcon />
                    {badges[item.href]}
                  </span>
                ) : null}
              </Link>
            ) : (
              <span key={item.label} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#7c93b0]">
                <NavIcon name={item.icon} />
                <span className="flex-1">{item.label}</span>
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Segera</span>
              </span>
            ),
          )}
        </div>
      ))}
    </nav>
  );
}
