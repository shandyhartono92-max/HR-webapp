"use client";

import { useActionState } from "react";
import { addCandidate, attachToJob } from "@/app/actions/candidate-bank";
import { Field, FormMessage, inputClass, useHydrated } from "@/app/ui/field";
import { educationLevels, manualSources } from "@/lib/labels";

const buttonClass =
  "rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60";

type Option = { id: string; name: string };

export function AddCandidateForm({ jobs }: { jobs: Option[] }) {
  const [state, action, pending] = useActionState(addCandidate, undefined);
  const hydrated = useHydrated();
  const e = state?.errors ?? {};
  const v = (k: string) => state?.values?.[k] ?? "";

  return (
    <form key={state?.attempt} action={action} className="space-y-4">
      <FormMessage message={state?.message} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nama lengkap" htmlFor="fullName" errors={e.fullName}>
          <input id="fullName" name="fullName" required defaultValue={v("fullName")} className={inputClass} />
        </Field>
        <Field label="Email" htmlFor="email" errors={e.email}>
          <input id="email" name="email" type="email" required defaultValue={v("email")} className={inputClass} />
        </Field>
        <Field label="Nomor HP / WhatsApp" htmlFor="phone" errors={e.phone}>
          <input id="phone" name="phone" type="tel" required placeholder="0812xxxxxxx" defaultValue={v("phone")} className={inputClass} />
        </Field>
        <Field label="Kota domisili" htmlFor="city" errors={e.city}>
          <input id="city" name="city" defaultValue={v("city")} className={inputClass} />
        </Field>
        <Field label="Pendidikan terakhir" htmlFor="lastEducation" errors={e.lastEducation}>
          <select id="lastEducation" name="lastEducation" defaultValue={v("lastEducation")} className={inputClass}>
            <option value="">Pilih…</option>
            {educationLevels.map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sumber" htmlFor="source" errors={e.source}>
          <select id="source" name="source" defaultValue={v("source")} className={inputClass}>
            <option value="">Pilih…</option>
            {Object.entries(manualSources).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        label="Masukkan ke lowongan (opsional)"
        htmlFor="jobId"
        hint="Kosongkan untuk hanya menyimpan di bank data. CV dinilai AI saat dimasukkan ke lowongan."
        errors={e.jobId}
      >
        <select id="jobId" name="jobId" defaultValue={v("jobId")} className={inputClass}>
          <option value="">Simpan di bank data saja</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="CV" htmlFor="cv" hint="PDF atau DOCX, maksimal 5 MB." errors={e.cv}>
        <input
          id="cv"
          name="cv"
          type="file"
          required
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm"
        />
      </Field>

      <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-medium text-amber-900">Persetujuan kandidat (UU PDP)</p>
        <p className="text-xs text-amber-800">
          Simpan data hanya jika kandidat sudah setuju. Saat meminta persetujuan, kirimkan tautan pemberitahuan privasi:{" "}
          <code className="rounded bg-white px-1">/karir/privasi</code>
        </p>
        <label className="flex items-start gap-2 text-sm text-amber-900">
          <input type="checkbox" name="consentConfirmed" defaultChecked={v("consentConfirmed") === "on"} className="mt-0.5 size-4 accent-teal-700" />
          Kandidat sudah menyetujui datanya disimpan dan diproses untuk rekrutmen.
        </label>
        {e.consentConfirmed?.map((m) => (
          <p key={m} className="text-xs text-red-700">
            {m}
          </p>
        ))}
        <Field label="Bukti persetujuan" htmlFor="consentEvidence" hint="Misal: setuju via email 30 Okt 2026; setuju via WhatsApp ke HR (Budi)." errors={e.consentEvidence}>
          <input id="consentEvidence" name="consentEvidence" defaultValue={v("consentEvidence")} className={inputClass} />
        </Field>
        <label className="flex items-start gap-2 text-sm text-amber-900">
          <input type="checkbox" name="talentPool" defaultChecked={v("talentPool") === "on"} className="mt-0.5 size-4 accent-teal-700" />
          Kandidat setuju disimpan di talent pool hingga 2 tahun (jika tidak, 6 bulan).
        </label>
      </div>

      <button type="submit" disabled={pending || !hydrated} className={buttonClass}>
        {pending ? "Menyimpan…" : "Simpan kandidat"}
      </button>
    </form>
  );
}

export function AttachToJobForm({ candidateId, jobs }: { candidateId: string; jobs: Option[] }) {
  const [state, action, pending] = useActionState(attachToJob.bind(null, candidateId), undefined);
  const hydrated = useHydrated();
  if (jobs.length === 0) return <p className="text-sm text-slate-600">Tidak ada lowongan terbuka yang belum dilamar kandidat ini.</p>;
  return (
    <form key={state?.attempt} action={action} className="flex flex-wrap items-end gap-2">
      <FormMessage message={state?.message} />
      <Field label="Lowongan" htmlFor="attachJob" errors={state?.errors?.jobId}>
        <select id="attachJob" name="jobId" defaultValue="" className={`${inputClass} min-w-64`}>
          <option value="">Pilih lowongan…</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </select>
      </Field>
      <button type="submit" disabled={pending || !hydrated} className={buttonClass}>
        {pending ? "Memproses…" : "Masukkan ke lowongan"}
      </button>
    </form>
  );
}
