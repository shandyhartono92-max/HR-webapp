"use client";

import { useActionState, useState, useTransition } from "react";
import { createForeignWorker, setForeignWorkerStatus, updateForeignWorker } from "@/app/actions/foreign-workers";
import { Field, FormMessage, inputClass, useHydrated } from "@/app/ui/field";
import { SiteField } from "@/app/ui/site-field";

export type ForeignWorkerValues = {
  fullName: string;
  passportNumber: string;
  kitasNumber: string;
  passportExpiry: string; // YYYY-MM-DD
  kitasExpiry: string;
  location: string;
};

const empty: ForeignWorkerValues = { fullName: "", passportNumber: "", kitasNumber: "", passportExpiry: "", kitasExpiry: "", location: "" };

// Add (no id) or edit (id) one foreign worker
export function ForeignWorkerForm({ id, initial = empty }: { id?: string; initial?: ForeignWorkerValues }) {
  const [state, action, pending] = useActionState(id ? updateForeignWorker.bind(null, id) : createForeignWorker, undefined);
  const hydrated = useHydrated();
  const e = state?.errors ?? {};
  const v = (k: keyof ForeignWorkerValues) => state?.values?.[k] ?? initial[k];

  return (
    <form key={state?.attempt} action={action} className="space-y-4">
      {!id && <SiteField />}
      <FormMessage message={state?.message} />
      {state?.ok && (
        <p role="status" className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-800">
          Perubahan tersimpan.
        </p>
      )}
      <Field label="Nama lengkap" htmlFor="fullName" hint="Sesuai paspor." errors={e.fullName}>
        <input id="fullName" name="fullName" required maxLength={120} defaultValue={v("fullName")} className={inputClass} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nomor paspor" htmlFor="passportNumber" errors={e.passportNumber}>
          <input id="passportNumber" name="passportNumber" required maxLength={30} defaultValue={v("passportNumber")} className={`${inputClass} font-mono uppercase`} />
        </Field>
        <Field label="Berlaku paspor sampai" htmlFor="passportExpiry" errors={e.passportExpiry}>
          <input id="passportExpiry" name="passportExpiry" type="date" required defaultValue={v("passportExpiry")} className={inputClass} />
        </Field>
        <Field label="Nomor KITAS" htmlFor="kitasNumber" errors={e.kitasNumber}>
          <input id="kitasNumber" name="kitasNumber" required maxLength={30} defaultValue={v("kitasNumber")} className={`${inputClass} font-mono uppercase`} />
        </Field>
        <Field label="Berlaku KITAS sampai" htmlFor="kitasExpiry" hint="Peringatan muncul 30 hari sebelumnya." errors={e.kitasExpiry}>
          <input id="kitasExpiry" name="kitasExpiry" type="date" required defaultValue={v("kitasExpiry")} className={inputClass} />
        </Field>
      </div>
      <Field label="Lokasi" htmlFor="location" hint="Ketik bebas, misal nama kawasan atau proyek." errors={e.location}>
        <input id="location" name="location" required maxLength={120} defaultValue={v("location")} className={inputClass} />
      </Field>
      <button
        type="submit"
        disabled={pending || !hydrated}
        className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : id ? "Simpan perubahan" : "Simpan TKA"}
      </button>
    </form>
  );
}

// Aktif ↔ Non Aktif
export function ForeignWorkerStatusButton({ id, active }: { id: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();
  const run = () => {
    if (active && !confirm("Jadikan Non Aktif? Peringatan KITAS untuk TKA ini berhenti.")) return;
    startTransition(async () => setError((await setForeignWorkerStatus(id, active ? "INACTIVE" : "ACTIVE")).error ?? null));
  };
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={run}
        disabled={pending || !hydrated}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : active ? "Jadikan Non Aktif" : "Aktifkan lagi"}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
