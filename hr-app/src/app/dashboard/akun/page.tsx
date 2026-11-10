import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { roleLabel } from "@/lib/labels";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Akun saya" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

export default async function AccountPage() {
  const user = await requireUser({ allowPasswordChange: true });

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Akun saya</h1>
      {user.mustChangePassword && (
        <p role="alert" className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Anda masuk dengan kata sandi sementara dari HR. Buat kata sandi baru untuk melanjutkan.
        </p>
      )}
      <section className="card p-5 text-sm">
        <p className="text-slate-500">Email</p>
        <p className="font-medium text-slate-900">{user.email}</p>
        <p className="mt-2 text-slate-500">Peran</p>
        <p className="font-medium text-slate-900">{roleLabel[user.role]}</p>
      </section>
      <section className="card p-5">
        <h2 className="mb-3 font-medium text-slate-900">Ganti kata sandi</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
