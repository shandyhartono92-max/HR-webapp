"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  deleteEmployee,
  renewContract,
  revealSensitive,
  updateEmployment,
  updateIdentity,
  updatePersonal,
  type RevealField,
} from "@/app/actions/employee-profile";
import { issueEmployeeLogin, type LoginResult } from "@/app/actions/accounts";
import { Field, FormMessage, inputClass, useHydrated } from "@/app/ui/field";
import type { FormState } from "@/lib/forms";
import { employeeStatusLabel, employmentTypeLabel, genderLabel, ptkpLabel } from "@/lib/labels";
import type { EmployeeStatus, EmploymentType, Gender, PtkpStatus } from "@/generated/prisma/enums";

const buttonClass =
  "rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60";

type Option = { id: string; name: string };

function Saved({ show }: { show?: boolean }) {
  return show ? <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-800">Tersimpan.</p> : null;
}

// A saved form can still have something to point out; only an unsaved one shows an error
function SaveResult({ state, savedText }: { state: FormState; savedText?: string }) {
  if (!state?.ok) return <FormMessage message={state?.message} />;
  return (
    <>
      <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-800">{savedText ?? "Tersimpan."}</p>
      {state.message && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{state.message}</p>}
    </>
  );
}

export function EmploymentForm({
  employeeId,
  departments,
  managers,
  initial,
}: {
  employeeId: string;
  departments: Option[];
  managers: Option[];
  initial: { departmentId: string; position: string; status: EmployeeStatus; managerId: string; exitDate: string };
}) {
  const [state, action, pending] = useActionState(updateEmployment.bind(null, employeeId), undefined);
  const hydrated = useHydrated();
  const e = state?.errors ?? {};
  const v = (k: keyof typeof initial) => state?.values?.[k] ?? initial[k];

  return (
    <form key={state?.attempt} action={action} className="space-y-3">
      <SaveResult state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Departemen" htmlFor="departmentId" errors={e.departmentId}>
          <select id="departmentId" name="departmentId" defaultValue={v("departmentId")} className={inputClass}>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Jabatan" htmlFor="position" errors={e.position}>
          <input id="position" name="position" required defaultValue={v("position")} className={inputClass} />
        </Field>
        <Field label="Status" htmlFor="status" errors={e.status}>
          <select id="status" name="status" defaultValue={v("status")} className={inputClass}>
            {Object.entries(employeeStatusLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Atasan langsung" htmlFor="managerId" errors={e.managerId}>
          <select id="managerId" name="managerId" defaultValue={v("managerId")} className={inputClass}>
            <option value="">Tidak ada</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Tanggal keluar"
          htmlFor="exitDate"
          hint="Untuk status Mengundurkan diri / Diberhentikan / Kontrak berakhir. Kosong = tanggal kontrak berakhir, atau hari ini."
          errors={e.exitDate}
        >
          <input id="exitDate" name="exitDate" type="date" defaultValue={v("exitDate")} className={inputClass} />
        </Field>
      </div>
      <button type="submit" disabled={pending || !hydrated} className={buttonClass}>
        {pending ? "Menyimpan…" : "Simpan data kepegawaian"}
      </button>
    </form>
  );
}

// Name, contact, employee number and join date, for fixing typos
export function IdentityForm({
  employeeId,
  initial,
  hasLogin,
}: {
  employeeId: string;
  initial: {
    fullName: string;
    email: string;
    phone: string;
    employeeNumber: string;
    joinDate: string;
    trainingStart: string;
    trainingEnd: string;
  };
  hasLogin: boolean;
}) {
  const [state, action, pending] = useActionState(updateIdentity.bind(null, employeeId), undefined);
  const hydrated = useHydrated();
  const e = state?.errors ?? {};
  const v = (k: keyof typeof initial) => state?.values?.[k] ?? initial[k];

  return (
    <form key={state?.attempt} action={action} className="space-y-3">
      <FormMessage message={state?.message} />
      <Saved show={state?.ok} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nama lengkap" htmlFor="idFullName" errors={e.fullName}>
          <input id="idFullName" name="fullName" required defaultValue={v("fullName")} className={inputClass} />
        </Field>
        <Field label="Employee ID" htmlFor="idNumber" errors={e.employeeNumber}>
          <input id="idNumber" name="employeeNumber" required defaultValue={v("employeeNumber")} className={inputClass} />
        </Field>
        <Field label="Email" htmlFor="idEmail" hint={hasLogin ? "Email login karyawan ikut berubah." : undefined} errors={e.email}>
          <input id="idEmail" name="email" type="email" required defaultValue={v("email")} className={inputClass} />
        </Field>
        <Field label="No. HP / WhatsApp" htmlFor="idPhone" errors={e.phone}>
          <input id="idPhone" name="phone" type="tel" required defaultValue={v("phone")} className={inputClass} />
        </Field>
        <Field label="Mulai bekerja" htmlFor="idJoin" errors={e.joinDate}>
          <input id="idJoin" name="joinDate" type="date" required defaultValue={v("joinDate")} className={inputClass} />
        </Field>
      </div>
      <fieldset className="rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-sm font-medium text-slate-700">Training (penanda payroll)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mulai training" htmlFor="idTrainStart" errors={e.trainingStart}>
            <input id="idTrainStart" name="trainingStart" type="date" defaultValue={v("trainingStart")} className={inputClass} />
          </Field>
          <Field label="Selesai training" htmlFor="idTrainEnd" errors={e.trainingEnd}>
            <input id="idTrainEnd" name="trainingEnd" type="date" defaultValue={v("trainingEnd")} className={inputClass} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Selama training, Employee ID berawalan T (misal T001). Sehari setelah tanggal selesai, huruf T dibuang otomatis (T001 → 001).
          Kosongkan keduanya jika tidak training.
        </p>
      </fieldset>
      <button type="submit" disabled={pending || !hydrated} className={buttonClass}>
        {pending ? "Menyimpan…" : "Simpan identitas"}
      </button>
      <p className="text-xs text-slate-500">Setiap perubahan tercatat di log audit (sebelum → sesudah).</p>
    </form>
  );
}

// Permanent delete, only for a record entered by mistake (the server re-checks the blockers)
export function DeleteEmployeeForm({ employeeId, employeeNumber }: { employeeId: string; employeeNumber: string }) {
  const [state, action, pending] = useActionState(deleteEmployee.bind(null, employeeId), undefined);
  const hydrated = useHydrated();
  return (
    <form key={state?.attempt} action={action} className="space-y-3">
      <FormMessage message={state?.message} />
      <p className="text-sm text-slate-700">
        Hanya untuk data yang <strong>salah input</strong>. Data karyawan, kontraknya dan riwayat di halaman ini akan hilang permanen.
        Untuk karyawan yang keluar, ubah statusnya saja.
      </p>
      <Field label={`Ketik ${employeeNumber} untuk mengonfirmasi`} htmlFor="confirmNumber" errors={state?.errors?.confirmNumber}>
        <input id="confirmNumber" name="confirmNumber" autoComplete="off" className={inputClass} />
      </Field>
      <button
        type="submit"
        disabled={pending || !hydrated}
        className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
      >
        {pending ? "Menghapus…" : "Hapus karyawan permanen"}
      </button>
    </form>
  );
}

// Next contract: extension of a PKWT, a new PKWT, or conversion to PKWTT
export function RenewContractForm({
  employeeId,
  initial,
  pkwtSince,
}: {
  employeeId: string;
  initial: { type: EmploymentType; position: string; startDate: string };
  pkwtSince: string | null;
}) {
  const [state, action, pending] = useActionState(renewContract.bind(null, employeeId), undefined);
  const hydrated = useHydrated();
  const e = state?.errors ?? {};
  const v = (k: string, fallback = "") => state?.values?.[k] ?? fallback;

  return (
    <form key={state?.attempt} action={action} className="space-y-3">
      <SaveResult state={state} savedText="Kontrak baru tersimpan." />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Jenis kontrak" htmlFor="renewType" errors={e.type}>
          <select id="renewType" name="type" defaultValue={v("type", initial.type)} className={inputClass}>
            {Object.entries(employmentTypeLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nomor kontrak" htmlFor="renewNumber" errors={e.contractNumber}>
          <input id="renewNumber" name="contractNumber" defaultValue={v("contractNumber")} className={inputClass} />
        </Field>
        <Field label="Jabatan" htmlFor="renewPosition" errors={e.position}>
          <input id="renewPosition" name="position" defaultValue={v("position", initial.position)} className={inputClass} />
        </Field>
        <Field label="Mulai" htmlFor="renewStart" errors={e.startDate}>
          <input id="renewStart" name="startDate" type="date" defaultValue={v("startDate", initial.startDate)} className={inputClass} />
        </Field>
        <Field
          label="Berakhir"
          htmlFor="renewEnd"
          hint={
            pkwtSince
              ? `Wajib untuk PKWT. Total PKWT sejak ${pkwtSince} maksimal 5 tahun (PP 35/2021). Kosongkan untuk PKWTT.`
              : "Wajib untuk PKWT. Kosongkan untuk PKWTT."
          }
          errors={e.endDate}
        >
          <input id="renewEnd" name="endDate" type="date" defaultValue={v("endDate")} className={inputClass} />
        </Field>
      </div>
      <button type="submit" disabled={pending || !hydrated} className={buttonClass}>
        {pending ? "Menyimpan…" : "Simpan kontrak baru"}
      </button>
      <p className="text-xs text-slate-500">
        Kontrak lama tetap tersimpan di riwayat. Jenis, jabatan dan tanggal berakhir karyawan ikut diperbarui, sehingga alert kontrak
        menyesuaikan.
      </p>
    </form>
  );
}

type SensitiveKey = "nik" | "npwp" | "bpjsKesehatan" | "bpjsKetenagakerjaan";

export function PersonalForm({
  employeeId,
  initial,
  last4,
}: {
  employeeId: string;
  initial: { birthPlace: string; birthDate: string; gender: Gender | ""; address: string; ptkpStatus: PtkpStatus | "" };
  last4: Record<SensitiveKey, string | null>;
}) {
  const [state, action, pending] = useActionState(updatePersonal.bind(null, employeeId), undefined);
  const e = state?.errors ?? {};
  const v = (k: keyof typeof initial) => state?.values?.[k] ?? initial[k];

  const sensitive: { key: SensitiveKey; label: string; digits: string }[] = [
    { key: "nik", label: "NIK (KTP)", digits: "16 digit" },
    { key: "npwp", label: "NPWP", digits: "15 atau 16 digit" },
    { key: "bpjsKesehatan", label: "No. BPJS Kesehatan", digits: "13 digit" },
    { key: "bpjsKetenagakerjaan", label: "No. BPJS Ketenagakerjaan (KPJ)", digits: "11 digit" },
  ];

  return (
    <form key={state?.attempt} action={action} className="space-y-4" autoComplete="off">
      <FormMessage message={state?.message} />
      <Saved show={state?.ok} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tempat lahir" htmlFor="birthPlace" errors={e.birthPlace}>
          <input id="birthPlace" name="birthPlace" defaultValue={v("birthPlace")} className={inputClass} />
        </Field>
        <Field label="Tanggal lahir" htmlFor="birthDate" errors={e.birthDate}>
          <input id="birthDate" name="birthDate" type="date" defaultValue={v("birthDate")} className={inputClass} />
        </Field>
        <Field label="Jenis kelamin" htmlFor="gender" hint="Sesuai KTP. Dipakai untuk mengecek NIK dan BPJS." errors={e.gender}>
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
        <textarea id="address" name="address" rows={2} defaultValue={v("address")} className={inputClass} />
      </Field>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-900">Nomor identitas (disimpan terenkripsi)</p>
        <p className="mt-0.5 text-xs text-slate-500">Kosongkan jika tidak ingin mengubah nomor yang sudah tersimpan.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {sensitive.map((s) => (
            <Field
              key={s.key}
              label={s.label}
              htmlFor={s.key}
              hint={last4[s.key] ? `Tersimpan: ••••${last4[s.key]}` : `Belum diisi · ${s.digits}`}
              errors={e[s.key]}
            >
              <input
                id={s.key}
                name={s.key}
                inputMode="numeric"
                autoComplete="off"
                placeholder={last4[s.key] ? "Ketik untuk mengganti" : s.digits}
                className={`${inputClass} font-mono`}
              />
            </Field>
          ))}
        </div>
      </div>

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Menyimpan…" : "Simpan data pribadi"}
      </button>
    </form>
  );
}

// Creates or resets the employee's login. The temporary password is shown once.
export function EmployeeLoginPanel({
  employeeId,
  login,
}: {
  employeeId: string;
  login: { email: string; mustChangePassword: boolean; lastLoginAt: string | null } | null;
}) {
  const [result, setResult] = useState<LoginResult | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    if (login && !confirm("Reset kata sandi? Kata sandi lama tidak bisa dipakai lagi.")) return;
    startTransition(async () => setResult(await issueEmployeeLogin(employeeId)));
  };

  return (
    <div className="space-y-2 text-sm">
      {login ? (
        <p className="text-slate-700">
          Akun login: <span className="font-medium">{login.email}</span>
          <br />
          <span className="text-xs text-slate-500">
            {login.mustChangePassword
              ? "Belum mengganti kata sandi sementara."
              : login.lastLoginAt
                ? `Terakhir masuk ${login.lastLoginAt}.`
                : "Belum pernah masuk."}
          </span>
        </p>
      ) : (
        <p className="text-slate-600">Belum punya akun login. Karyawan butuh akun untuk mengajukan perubahan rekening gaji.</p>
      )}
      {result?.tempPassword && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs text-amber-800">Kata sandi sementara (hanya ditampilkan sekali, serahkan langsung ke karyawan):</p>
          <p className="mt-1 select-all font-mono text-base font-semibold tracking-wider text-slate-900">{result.tempPassword}</p>
          <p className="mt-1 text-xs text-amber-800">Login: {result.email}. Karyawan wajib menggantinya saat pertama masuk.</p>
        </div>
      )}
      {result?.error && <p className="text-xs text-red-700">{result.error}</p>}
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? "Memproses…" : login ? "Reset kata sandi" : "Buat akun login"}
      </button>
    </div>
  );
}

const HIDE_AFTER_MS = 30_000;

// Shows ••••1234; "Lihat" fetches the full number (audited) and hides it again after 30 seconds
export function SensitiveValue({ employeeId, field, last4 }: { employeeId: string; field: RevealField; last4: string | null }) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!value) return;
    const t = setTimeout(() => setValue(null), HIDE_AFTER_MS);
    return () => clearTimeout(t);
  }, [value]);

  if (!last4) return <span className="text-slate-400">Belum diisi</span>;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-mono">{value ?? `••••${last4}`}</span>
      {value ? (
        <button type="button" onClick={() => setValue(null)} className="text-xs text-slate-600 hover:underline">
          Sembunyikan
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await revealSensitive(employeeId, field);
              if ("value" in r) {
                setError(null);
                setValue(r.value);
              } else setError(r.error);
            })
          }
          className="text-xs text-brand-700 hover:underline disabled:opacity-60"
        >
          {pending ? "Memuat…" : "Lihat"}
        </button>
      )}
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
