"use client";

import { useSyncExternalStore, type ReactNode } from "react";

// False during server render and hydration, true once the page is interactive.
// Dashboard submit buttons stay disabled until then: a submit before hydration falls
// back to a plain POST, whose re-render trips a Next.js cookies invariant.
const noopSubscribe = () => () => {};
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600";

export function Field({
  label,
  htmlFor,
  hint,
  errors,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  errors?: string[];
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && !errors?.length && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {errors?.map((e) => (
        <p key={e} className="mt-1 text-xs text-red-700">
          {e}
        </p>
      ))}
    </div>
  );
}

export function FormMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}
