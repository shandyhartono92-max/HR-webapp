"use client";

import { useActionState } from "react";
import { createEmployee } from "@/app/actions/employees";
import { Field, FormMessage, inputClass, useHydrated } from "@/app/ui/field";
import { WorkLocationFields } from "@/app/ui/work-location-fields";
import { employmentTypeLabel, genderLabel, ptkpLabel } from "@/lib/labels";

type Option = { id: string; name: string };

const sectionClass = "card space-y-3 p-5";
const gridClass = "grid gap-3 sm:grid-cols-2";

const sensitive = [
  { key: "nik", label: "NIK (KTP)", digits: "16 digit" },
  { key: "npwp", label: "NPWP", digits: "15 atau 16 digit" },
  { key: "bpjsKesehatan", label: "No. BPJS Kesehatan", digits: "13 digit" },
  { key: "bpjsKetenagakerjaan", label: "No. BPJS Ketenagakerjaan (KPJ)", digits: "11 digit" },
] as const;

export function NewEmployeeForm({ departments }: { departments: Option[] }) {
  const [state, action, pending] = useActionState(createEmployee, undefined);
  const hydrated = useHydrated();
  const e = state?.errors ?? {};
  const v = (name: string, fallback = "") => state?.values?.[name] ?? fallback;

  return (
    <form key={state?.attempt} action={action} className="space-y-4" autoComplete="off">
      <FormMessage message={state?.message} />

      <section className={sectionClass}>
        <h2 className="font-medium text-slate-900">Kepegawaian</h2>
        <div className={gridClass}>
          <Field label="Employee ID" htmlFor="employeeNumber" hint="Bila sedang training: huruf T lalu angka (misal T001)." errors={e.employeeNumber}>
            <input id="employeeNumber" name="employeeNumber" required maxLength={30} defaultValue={v("employeeNumber")} className={inputClass} />
          </Field>
          <Field label="Nomor kontrak" htmlFor="contractNumber" hint="Kosongkan bila belum ada; diisi <Employee ID>/MANUAL." errors={e.contractNumber}>
            <input id="contractNumber" name="contractNumber" maxLength={60} defaultValue={v("contractNumber")} className={inputClass} />
          </Field>
          <Field label="Departemen" htmlFor="departmentId" errors={e.departmentId}>
            <select id="departmentId" name="departmentId" required defaultValue={v("departmentId")} className={inputClass}>
              <option value="">Pilih departemen…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Jabatan" htmlFor="position" errors={e.position}>
            <input id="position" name="position" required maxLength={120} defaultValue={v("position")} className={inputClass} />
          </Field>
          <Field label="Jenis hubungan kerja" htmlFor="employmentType" errors={e.employmentType}>
            <select id="employmentType" name="employmentType" required defaultValue={v("employmentType")} className={inputClass}>
              <option value="">Pilih jenis…</option>
              {Object.entries(employmentTypeLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" htmlFor="status" hint="Kontrak (PKWT) tidak boleh masa percobaan." errors={e.status}>
            <select id="status" name="status" defaultValue={v("status", "ACTIVE")} className={inputClass}>
              <option value="ACTIVE">Aktif</option>
              <option value="PROBATION">Masa percobaan</option>
            </select>
          </Field>
          <Field label="Mulai bekerja" htmlFor="joinDate" errors={e.joinDate}>
            <input id="joinDate" name="joinDate" type="date" required defaultValue={v("joinDate")} className={inputClass} />
          </Field>
          <Field label="Kontrak berakhir" htmlFor="endDate" hint="Wajib untuk Kontrak (PKWT)." errors={e.endDate}>
            <input id="endDate" name="endDate" type="date" defaultValue={v("endDate")} className={inputClass} />
          </Field>
          <Field label="Mulai training" htmlFor="trainingStart" errors={e.trainingStart}>
            <input id="trainingStart" name="trainingStart" type="date" defaultValue={v("trainingStart")} className={inputClass} />
          </Field>
          <Field label="Selesai training" htmlFor="trainingEnd" hint="Kosongkan keduanya bila tidak training." errors={e.trainingEnd}>
            <input id="trainingEnd" name="trainingEnd" type="date" defaultValue={v("trainingEnd")} className={inputClass} />
          </Field>
        </div>
        {/* Its own row: Warehouse comes and goes with OPS, and would shift the pairs above */}
        <div className={gridClass}>
          <WorkLocationFields location={v("workLocation")} warehouse={v("warehouse")} errors={e} />
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="font-medium text-slate-900">Kontak</h2>
        <Field label="Nama lengkap" htmlFor="fullName" errors={e.fullName}>
          <input id="fullName" name="fullName" required maxLength={120} defaultValue={v("fullName")} className={inputClass} />
        </Field>
        <div className={gridClass}>
          <Field label="Email" htmlFor="email" hint="Dipakai juga sebagai email login bila akun dibuat nanti." errors={e.email}>
            <input id="email" name="email" type="email" required defaultValue={v("email")} className={inputClass} />
          </Field>
          <Field label="No. HP / WhatsApp" htmlFor="phone" errors={e.phone}>
            <input id="phone" name="phone" type="tel" inputMode="tel" required defaultValue={v("phone")} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className={sectionClass}>
        <div>
          <h2 className="font-medium text-slate-900">Data pribadi</h2>
          <p className="mt-0.5 text-xs text-slate-500">Boleh dikosongkan dan dilengkapi nanti dari profil karyawan.</p>
        </div>
        <div className={gridClass}>
          <Field label="Tempat lahir" htmlFor="birthPlace" errors={e.birthPlace}>
            <input id="birthPlace" name="birthPlace" maxLength={80} defaultValue={v("birthPlace")} className={inputClass} />
          </Field>
          <Field label="Tanggal lahir" htmlFor="birthDate" errors={e.birthDate}>
            <input id="birthDate" name="birthDate" type="date" defaultValue={v("birthDate")} className={inputClass} />
          </Field>
          <Field label="Jenis kelamin" htmlFor="gender" hint="Sesuai KTP. Dipakai untuk mengecek NIK." errors={e.gender}>
            <select id="gender" name="gender" defaultValue={v("gender")} className={inputClass}>
              <option value="">Pilih…</option>
              {Object.entries(genderLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status PTKP (PPh 21)" htmlFor="ptkpStatus" errors={e.ptkpStatus}>
            <select id="ptkpStatus" name="ptkpStatus" defaultValue={v("ptkpStatus")} className={inputClass}>
              <option value="">Pilih…</option>
              {Object.entries(ptkpLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Alamat (sesuai KTP)" htmlFor="address" errors={e.address}>
          <textarea id="address" name="address" rows={2} maxLength={500} defaultValue={v("address")} className={inputClass} />
        </Field>
        <Field label="Nama ibu kandung" htmlFor="motherMaidenName" hint="Untuk pendaftaran BPJS." errors={e.motherMaidenName}>
          <input id="motherMaidenName" name="motherMaidenName" maxLength={80} defaultValue={v("motherMaidenName")} className={inputClass} />
        </Field>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-900">Nomor identitas (disimpan terenkripsi)</p>
          <p className="mt-0.5 text-xs text-slate-500">Bila ada isian yang salah, nomor ini perlu diketik ulang: demi keamanan, tidak dikirim kembali ke layar.</p>
          <div className={`mt-3 ${gridClass}`}>
            {sensitive.map((s) => (
              <Field key={s.key} label={s.label} htmlFor={s.key} hint={s.digits} errors={e[s.key]}>
                <input id={s.key} name={s.key} inputMode="numeric" autoComplete="off" placeholder={s.digits} className={`${inputClass} font-mono`} />
              </Field>
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || !hydrated}
          className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : "Simpan karyawan"}
        </button>
        <p className="text-xs text-slate-500">Rekening gaji dan akun login dibuat dari profil setelah tersimpan.</p>
      </div>
    </form>
  );
}
