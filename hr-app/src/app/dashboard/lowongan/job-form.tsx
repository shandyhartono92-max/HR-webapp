"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormMessage, inputClass } from "@/app/ui/field";
import { educationLevels, employmentTypeLabel, jobStatusLabel } from "@/lib/labels";
import type { FormState } from "@/lib/forms";
import type { EmploymentType, JobStatus } from "@/generated/prisma/enums";
import { SiteField } from "@/app/ui/site-field";

export type JobFormValues = {
  title: string;
  departmentName: string;
  hiringManagerName: string;
  employmentType: EmploymentType;
  location: string;
  description: string;
  requirements: string;
  minEducation: string;
  minExperienceYears: string;
  salaryMin: string;
  salaryMax: string;
  showSalary: boolean;
  headcount: string;
  status: JobStatus;
};

export function JobForm({
  action,
  initial,
  departments,
  managers,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial: JobFormValues;
  departments: string[];
  managers: string[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const e = state?.errors ?? {};
  // After a failed submit, refill from what was sent
  const v = (name: keyof JobFormValues) => state?.values?.[name] ?? String(initial[name] ?? "");
  const showSalary = state?.values ? state.values.showSalary === "on" : initial.showSalary;

  return (
    <form key={state?.attempt} action={formAction} className="space-y-6">
      <SiteField />
      <FormMessage message={state?.message} />

      <section className="space-y-4 card p-5">
        <h2 className="font-medium text-slate-900">Informasi posisi</h2>
        <Field label="Judul posisi" htmlFor="title" errors={e.title}>
          <input id="title" name="title" required defaultValue={v("title")} className={inputClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Free text; the datalist only suggests names already in use */}
          <Field
            label="Departemen"
            htmlFor="departmentName"
            hint="Ketik bebas. Departemen baru otomatis ditambahkan."
            errors={e.departmentName}
          >
            <input
              id="departmentName"
              name="departmentName"
              list="departmentName-options"
              required
              autoComplete="off"
              defaultValue={v("departmentName")}
              className={inputClass}
            />
            <datalist id="departmentName-options">
              {departments.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>
          <Field
            label="Hiring manager"
            htmlFor="hiringManagerName"
            hint="Ketik bebas. Kalau nama atau email-nya sama dengan akun di portal, orang itu bisa melihat kandidat lowongan ini."
            errors={e.hiringManagerName}
          >
            <input
              id="hiringManagerName"
              name="hiringManagerName"
              list="hiringManagerName-options"
              required
              autoComplete="off"
              defaultValue={v("hiringManagerName")}
              className={inputClass}
            />
            <datalist id="hiringManagerName-options">
              {managers.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>
          <Field label="Jenis pekerjaan" htmlFor="employmentType" errors={e.employmentType}>
            <select id="employmentType" name="employmentType" defaultValue={v("employmentType")} className={inputClass}>
              {Object.entries(employmentTypeLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Lokasi" htmlFor="location" hint="Misal: Jakarta, Surabaya (hybrid)" errors={e.location}>
            <input id="location" name="location" required defaultValue={v("location")} className={inputClass} />
          </Field>
          <Field label="Jumlah dibutuhkan" htmlFor="headcount" errors={e.headcount}>
            <input id="headcount" name="headcount" type="number" min={1} max={100} defaultValue={v("headcount")} className={inputClass} />
          </Field>
          <Field label="Status" htmlFor="status" hint="Hanya status Dibuka yang tampil di halaman karir." errors={e.status}>
            <select id="status" name="status" defaultValue={v("status")} className={inputClass}>
              {Object.entries(jobStatusLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="space-y-4 card p-5">
        <h2 className="font-medium text-slate-900">Deskripsi & kualifikasi</h2>
        <Field label="Deskripsi pekerjaan" htmlFor="description" errors={e.description}>
          <textarea id="description" name="description" rows={6} required defaultValue={v("description")} className={inputClass} />
        </Field>
        <Field
          label="Kualifikasi"
          htmlFor="requirements"
          hint="Dipakai juga oleh AI untuk menilai kecocokan CV. Tulis satu syarat per baris."
          errors={e.requirements}
        >
          <textarea id="requirements" name="requirements" rows={6} required defaultValue={v("requirements")} className={inputClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pendidikan minimal" htmlFor="minEducation" errors={e.minEducation}>
            <select id="minEducation" name="minEducation" defaultValue={v("minEducation")} className={inputClass}>
              <option value="">Tidak ditentukan</option>
              {educationLevels.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pengalaman minimal (tahun)" htmlFor="minExperienceYears" errors={e.minExperienceYears}>
            <input id="minExperienceYears" name="minExperienceYears" type="number" min={0} max={40} defaultValue={v("minExperienceYears")} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="space-y-4 card p-5">
        <h2 className="font-medium text-slate-900">Gaji (Rupiah per bulan)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum" htmlFor="salaryMin" errors={e.salaryMin}>
            <input id="salaryMin" name="salaryMin" type="number" min={0} step={100000} defaultValue={v("salaryMin")} className={inputClass} />
          </Field>
          <Field label="Maksimum" htmlFor="salaryMax" errors={e.salaryMax}>
            <input id="salaryMax" name="salaryMax" type="number" min={0} step={100000} defaultValue={v("salaryMax")} className={inputClass} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="showSalary" defaultChecked={showSalary} className="size-4 accent-brand-700" />
          Tampilkan kisaran gaji di halaman karir
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : submitLabel}
        </button>
        <Link href="/dashboard/lowongan" className="text-sm text-slate-600 hover:underline">
          Batal
        </Link>
      </div>
    </form>
  );
}
