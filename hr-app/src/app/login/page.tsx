import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Portal HR</h1>
        <p className="mt-1 text-sm text-slate-500">Masuk dengan akun perusahaan Anda.</p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
