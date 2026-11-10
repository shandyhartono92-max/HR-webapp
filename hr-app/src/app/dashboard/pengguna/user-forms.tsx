"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createUser,
  resetUserPassword,
  setUserActive,
  updateUser,
  type PasswordResult,
  type UserFormState,
} from "@/app/actions/users";
import { Field, FormMessage, inputClass, useHydrated } from "@/app/ui/field";
import { roleLabel } from "@/lib/labels";
import type { Role } from "@/generated/prisma/enums";

const buttonClass =
  "rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60";
const secondaryClass =
  "rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60";

const roleHints: Record<Role, string> = {
  ADMIN: "Semua fitur, termasuk Kelola Pengguna.",
  HR: "Semua fitur HR, kecuali Kelola Pengguna.",
  HIRING_MANAGER: "Hanya lowongan dan kandidat miliknya.",
  EMPLOYEE: "Rekening gaji sendiri.",
};

// Shown once: the password is stored only as a hash and cannot be displayed again
function TemporaryPassword({ email, password }: { email: string; password: string }) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-medium">Catat sekarang. Kata sandi ini hanya tampil sekali.</p>
      <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-1">
        <dt>Email</dt>
        <dd className="break-all font-mono">{email}</dd>
        <dt>Kata sandi</dt>
        <dd className="font-mono font-semibold">{password}</dd>
      </dl>
      <p className="mt-2 text-xs">Pengguna wajib menggantinya saat login pertama.</p>
    </div>
  );
}

export function CreateUserForm() {
  const [state, action, pending] = useActionState<UserFormState, FormData>(createUser, undefined);
  const hydrated = useHydrated();
  const e = state?.errors ?? {};
  const v = (k: string) => state?.values?.[k] ?? "";

  return (
    <div className="space-y-4">
      {state?.ok && state.tempPassword && (
        <div className="space-y-2">
          <TemporaryPassword email={state.email!} password={state.tempPassword} />
          {state.linkedEmployee && (
            <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">Terhubung otomatis ke data karyawan {state.linkedEmployee} (email sama).</p>
          )}
          {Boolean(state.linkedJobs) && (
            <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">
              Tersambung otomatis ke {state.linkedJobs} lowongan yang hiring manager-nya bernama sama.
            </p>
          )}
        </div>
      )}
      <form key={state?.attempt} action={action} className="space-y-3" autoComplete="off">
        <FormMessage message={state?.message} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Nama lengkap" htmlFor="newName" errors={e.name}>
            <input id="newName" name="name" required defaultValue={v("name")} className={inputClass} />
          </Field>
          <Field label="Email (untuk login)" htmlFor="newEmail" errors={e.email}>
            <input id="newEmail" name="email" type="email" required autoComplete="off" defaultValue={v("email")} className={inputClass} />
          </Field>
          <Field label="Peran" htmlFor="newRole" errors={e.role}>
            <select id="newRole" name="role" defaultValue={v("role") || "HR"} className={inputClass}>
              {(["HR", "HIRING_MANAGER", "ADMIN"] as const).map((r) => (
                <option key={r} value={r}>
                  {roleLabel[r]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <ul className="space-y-0.5 text-xs text-slate-500">
          {(["HR", "HIRING_MANAGER", "ADMIN"] as const).map((r) => (
            <li key={r}>
              <strong>{roleLabel[r]}:</strong> {roleHints[r]}
            </li>
          ))}
        </ul>
        <button type="submit" disabled={pending || !hydrated} className={buttonClass}>
          {pending ? "Membuat akun…" : "Buat akun"}
        </button>
        <p className="text-xs text-slate-500">Kata sandi sementara dibuat otomatis. Akun karyawan dibuat dari profil karyawan (bagian Akun login).</p>
      </form>
    </div>
  );
}

export function EditUserForm({
  user,
  isSelf,
  linked,
}: {
  user: { id: string; name: string; email: string; role: Role };
  isSelf: boolean;
  linked: boolean;
}) {
  const [state, action, pending] = useActionState(updateUser.bind(null, user.id), undefined);
  const hydrated = useHydrated();
  const e = state?.errors ?? {};
  const v = (k: "name" | "email" | "role") => state?.values?.[k] ?? user[k];
  const roles = (linked ? ["EMPLOYEE", "HR", "HIRING_MANAGER", "ADMIN"] : ["HR", "HIRING_MANAGER", "ADMIN"]) as Role[];

  return (
    <form key={state?.attempt} action={action} className="space-y-3">
      <FormMessage message={state?.message} />
      {state?.ok && <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-800">Tersimpan.</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nama" htmlFor={`name-${user.id}`} hint={linked ? "Mengikuti data karyawan." : undefined} errors={e.name}>
          <input id={`name-${user.id}`} name="name" required readOnly={linked} defaultValue={v("name")} className={inputClass} />
        </Field>
        <Field label="Email" htmlFor={`email-${user.id}`} hint={linked ? "Mengikuti data karyawan." : undefined} errors={e.email}>
          <input id={`email-${user.id}`} name="email" type="email" required readOnly={linked} defaultValue={v("email")} className={inputClass} />
        </Field>
        <Field label="Peran" htmlFor={`role-${user.id}`} hint={isSelf ? "Peran Anda sendiri tidak bisa diubah." : undefined} errors={e.role}>
          {isSelf ? (
            <>
              <input type="hidden" name="role" value={user.role} />
              <select id={`role-${user.id}`} disabled value={user.role} className={inputClass}>
                <option value={user.role}>{roleLabel[user.role]}</option>
              </select>
            </>
          ) : (
            <select id={`role-${user.id}`} name="role" defaultValue={v("role")} className={inputClass}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {roleLabel[r]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <button type="submit" disabled={pending || !hydrated} className={buttonClass}>
        {pending ? "Menyimpan…" : "Simpan perubahan"}
      </button>
    </form>
  );
}

export function UserActions({ userId, name, isActive }: { userId: string; name: string; isActive: boolean }) {
  const [busy, startTransition] = useTransition();
  const [reset, setReset] = useState<PasswordResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();

  return (
    <div className="space-y-2">
      {error && <FormMessage message={error} />}
      {reset?.error && <FormMessage message={reset.error} />}
      {reset?.tempPassword && <TemporaryPassword email={reset.email!} password={reset.tempPassword} />}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !hydrated}
          className={secondaryClass}
          onClick={() => {
            if (!confirm(`Reset kata sandi ${name}? Kata sandi lamanya langsung tidak berlaku.`)) return;
            setError(null);
            startTransition(async () => setReset(await resetUserPassword(userId)));
          }}
        >
          Reset kata sandi
        </button>
        <button
          type="button"
          disabled={busy || !hydrated}
          className={isActive ? "rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60" : secondaryClass}
          onClick={() => {
            if (isActive && !confirm(`Nonaktifkan akun ${name}? Pengguna ini langsung tidak bisa masuk.`)) return;
            setError(null);
            startTransition(async () => {
              const r = await setUserActive(userId, !isActive);
              if (r.error) setError(r.error);
            });
          }}
        >
          {isActive ? "Nonaktifkan" : "Aktifkan lagi"}
        </button>
      </div>
    </div>
  );
}
