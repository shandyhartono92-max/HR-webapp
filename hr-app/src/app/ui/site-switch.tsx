"use client";

import { useActionState } from "react";
import { switchSite } from "@/app/actions/site-switch";

type Option = { code: string; label: string };

function PinIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0 text-brand-700">
      <path fillRule="evenodd" d="M10 18s6-5.2 6-10A6 6 0 0 0 4 8c0 4.8 6 10 6 10Zm0-7.5A2.5 2.5 0 1 0 10 5.5a2.5 2.5 0 0 0 0 5Z" clipRule="evenodd" />
    </svg>
  );
}

const pillClass = "flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-800";

// The active location in the header. With access to other locations it opens a small
// menu to switch; without, it is a plain label.
export function SiteSwitch({ current, others }: { current: Option; others: Option[] }) {
  const [state, action, pending] = useActionState(switchSite, undefined);

  if (others.length === 0) {
    return (
      <span className={pillClass} title="Lokasi aktif">
        <PinIcon />
        <span data-site-pill>{current.label}</span>
      </span>
    );
  }

  return (
    <details className="relative" open={Boolean(state?.error) || undefined}>
      <summary className={`${pillClass} cursor-pointer list-none hover:bg-slate-100 [&::-webkit-details-marker]:hidden`} title="Lokasi aktif · klik untuk pindah">
        <PinIcon />
        <span data-site-pill>{current.label}</span>
        <span aria-hidden="true" className="text-xs text-slate-400">
          ▾
        </span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
        <p className="px-2 pb-1 text-xs text-slate-500">Anda sedang di {current.label}.</p>
        <form action={action} className="space-y-1">
          {others.map((o) => (
            <button
              key={o.code}
              type="submit"
              name="site"
              value={o.code}
              disabled={pending}
              className="w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-60"
            >
              Pindah ke {o.label}
            </button>
          ))}
        </form>
        {state?.error && (
          <p data-site-error role="alert" className="mt-1 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">
            {state.error}
          </p>
        )}
      </div>
    </details>
  );
}
