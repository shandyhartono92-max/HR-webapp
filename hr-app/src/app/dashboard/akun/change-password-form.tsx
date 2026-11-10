"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/actions/accounts";
import { Field, FormMessage, inputClass } from "@/app/ui/field";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);
  const e = state?.errors ?? {};

  return (
    <form key={state?.attempt} action={action} className="space-y-3">
      <FormMessage message={state?.message} />
      <Field label="Kata sandi saat ini" htmlFor="currentPassword" errors={e.currentPassword}>
        <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required className={inputClass} />
      </Field>
      <Field label="Kata sandi baru" htmlFor="newPassword" hint="Minimal 10 karakter, ada huruf dan angka." errors={e.newPassword}>
        <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required className={inputClass} />
      </Field>
      <Field label="Ulangi kata sandi baru" htmlFor="confirmPassword" errors={e.confirmPassword}>
        <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required className={inputClass} />
      </Field>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Simpan kata sandi"}
      </button>
    </form>
  );
}
