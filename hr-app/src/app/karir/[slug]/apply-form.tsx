"use client";

import Link from "next/link";
import { useActionState } from "react";
import { applyForJob } from "@/app/actions/apply";
import { Field, FormMessage, inputClass } from "@/app/ui/field";
import { applicationSources, educationLevels } from "@/lib/labels";

export function ApplyForm({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState(applyForJob, undefined);
  const e = state?.errors ?? {};
  const v = (name: string) => state?.values?.[name] ?? "";

  if (state?.ok) {
    return (
      <div role="status" className="rounded-xl border border-brand-200 bg-brand-50 p-6">
        <p className="font-medium text-brand-900">Terima kasih, lamaran Anda sudah kami terima.</p>
        <p className="mt-1 text-sm text-brand-800">
          Tim HR akan meninjau CV Anda dan menghubungi Anda melalui email atau telepon jika Anda lolos ke tahap berikutnya.
        </p>
      </div>
    );
  }

  return (
    <form key={state?.attempt} action={action} className="space-y-4">
      <FormMessage message={state?.message} />
      <input type="hidden" name="jobId" value={jobId} />
      {/* Honeypot for bots, hidden from people and screen readers */}
      <div aria-hidden="true" className="absolute -left-[9999px]">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Field label="Nama lengkap" htmlFor="fullName" errors={e.fullName}>
        <input id="fullName" name="fullName" required autoComplete="name" defaultValue={v("fullName")} className={inputClass} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="email" errors={e.email}>
          <input id="email" name="email" type="email" required autoComplete="email" defaultValue={v("email")} className={inputClass} />
        </Field>
        <Field label="Nomor HP / WhatsApp" htmlFor="phone" errors={e.phone}>
          <input id="phone" name="phone" type="tel" required autoComplete="tel" placeholder="0812xxxxxxx" defaultValue={v("phone")} className={inputClass} />
        </Field>
        <Field label="Kota domisili" htmlFor="city" errors={e.city}>
          <input id="city" name="city" autoComplete="address-level2" defaultValue={v("city")} className={inputClass} />
        </Field>
        <Field label="Pendidikan terakhir" htmlFor="lastEducation" errors={e.lastEducation}>
          <select id="lastEducation" name="lastEducation" required defaultValue={v("lastEducation")} className={inputClass}>
            <option value="">Pilih…</option>
            {educationLevels.map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Gaji yang diharapkan (Rp/bulan)" htmlFor="expectedSalary" hint="Opsional" errors={e.expectedSalary}>
          <input id="expectedSalary" name="expectedSalary" type="number" min={0} step={100000} defaultValue={v("expectedSalary")} className={inputClass} />
        </Field>
        <Field label="Bisa mulai bekerja dalam (hari)" htmlFor="noticePeriodDays" hint="Opsional. Isi 0 jika bisa segera." errors={e.noticePeriodDays}>
          <input id="noticePeriodDays" name="noticePeriodDays" type="number" min={0} max={365} defaultValue={v("noticePeriodDays")} className={inputClass} />
        </Field>
      </div>
      <Field label="Dari mana Anda mengetahui lowongan ini?" htmlFor="source" errors={e.source}>
        <select id="source" name="source" defaultValue={v("source")} className={inputClass}>
          <option value="">Pilih…</option>
          {Object.entries(applicationSources).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
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
          className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:text-slate-700 hover:file:bg-slate-200"
        />
      </Field>
      <p className="text-xs text-slate-500">
        Mohon tidak mencantumkan foto, agama, atau status pernikahan. Data tersebut tidak kami perlukan untuk menilai lamaran.
      </p>

      <div className="space-y-2 rounded-lg bg-slate-50 p-4">
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="consent" required defaultChecked={v("consent") === "on"} className="mt-0.5 size-4 accent-brand-700" />
          <span>
            Saya telah membaca dan menyetujui{" "}
            <Link href="/karir/privasi" target="_blank" className="text-brand-700 underline">
              pemberitahuan privasi
            </Link>{" "}
            dan mengizinkan data saya diproses untuk rekrutmen ini.
          </span>
        </label>
        {e.consent?.map((msg) => (
          <p key={msg} className="text-xs text-red-700">
            {msg}
          </p>
        ))}
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="talentPool" defaultChecked={v("talentPool") === "on"} className="mt-0.5 size-4 accent-brand-700" />
          <span>(Opsional) Simpan data saya hingga 2 tahun untuk lowongan lain yang sesuai.</span>
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Mengirim…" : "Kirim lamaran"}
      </button>
    </form>
  );
}
