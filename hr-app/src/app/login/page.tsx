import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LAST_SITE_COOKIE, siteByCode, sites } from "@/lib/sites";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };
// Reads the last-location cookie, so the page renders per request
export const instant = false;

export default async function LoginPage() {
  const options = sites().map((s) => ({ code: s.code, label: s.label }));
  // The location picked last time on this browser, if it still exists
  const last = siteByCode((await cookies()).get(LAST_SITE_COOKIE)?.value)?.code ?? "";
  return (
    <main className="flex flex-1 items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm card p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Portal HR</h1>
        <p className="mt-1 text-sm text-slate-500">Masuk dengan akun perusahaan Anda.</p>
        <div className="mt-6">
          <LoginForm sites={options} lastSite={last} />
        </div>
      </div>
    </main>
  );
}
