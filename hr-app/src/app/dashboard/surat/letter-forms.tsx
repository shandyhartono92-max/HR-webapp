"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, useSyncExternalStore, type FormEvent } from "react";
import { issueEmployeeLetter, issueOfferLetter, saveTemplate, type IssueState } from "@/app/actions/letters";
import { Field, FormMessage, inputClass } from "@/app/ui/field";
import { employmentTypeLabel, letterTypeLabel } from "@/lib/labels";
import {
  changeLetterTypes,
  fillTemplate,
  isChangeLetter,
  missingPlaceholders,
  placeholderHelp,
  SALARY_UNCHANGED_TEXT,
  summonsRounds,
  type LetterVars,
} from "@/lib/letters/fill";
import type { EmploymentType, LetterType } from "@/generated/prisma/enums";

const buttonClass =
  "rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60";

export type TemplateView = { name: string; body: string };

// These forms are controlled (they drive the live preview). <form action={…}> resets
// the DOM after submit, which would desync selects from React state, so once the page
// is interactive onSubmit takes over and skips the reset. Keep action={action} as well:
// before hydration it makes the browser POST to the server action. Without it the
// browser falls back to GET and puts the form (salary, SP reasons) in the URL.
// The no-JS fallback POST also trips a Next.js invariant when re-rendering, so the
// submit buttons stay disabled until the page is interactive (also blocks Enter).
const noop = () => () => {};
function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}

function submitWithoutReset(dispatch: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
}

// Approximates the PDF layout so HR can read the letter before issuing it
export function LetterPreview({ template, vars }: { template: TemplateView; vars: LetterVars }) {
  const filled = fillTemplate(template.body, { nomor_surat: "(dibuat saat terbit)", ...vars });
  const missing = missingPlaceholders(template.body, { nomor_surat: "x", ...vars });

  return (
    <div className="space-y-2">
      {missing.length > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Belum terisi: {missing.map((m) => `[${m}]`).join(", ")}
        </p>
      )}
      <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 font-serif text-[13px] leading-relaxed text-slate-900 shadow-inner">
        <p className="text-center font-sans text-sm font-bold underline">{template.name}</p>
        <p className="mb-4 text-center font-sans text-xs text-slate-500">Nomor: (dibuat saat terbit)</p>
        {filled.split(/\n\s*\n/).map((para, i) => (
          <div key={i} className="mb-3">
            {para.split("\n").map((line, j) => {
              const kv = line.match(/^(.{1,40}?)\s+:\s+(.*)$/);
              return kv ? (
                <div key={j} className="grid grid-cols-[10rem_auto_1fr] gap-2 pl-4">
                  <span>{kv[1]}</span>
                  <span>:</span>
                  <span className="whitespace-pre-line">{kv[2]}</span>
                </div>
              ) : (
                <p key={j} className="whitespace-pre-line">
                  {line}
                </p>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function IssuedNotice({ state }: { state: IssueState }) {
  if (!state?.ok || !state.letterId) return null;
  return (
    <div className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-900">
      Surat <strong>{state.letterNumber}</strong> diterbitkan.{" "}
      <a href={`/dashboard/surat/${state.letterId}/pdf`} className="font-medium underline">
        Unduh PDF
      </a>
    </div>
  );
}

const employeeLetterTypes: LetterType[] = [
  "SP1",
  "SP2",
  "SP3",
  "SURAT_KETERANGAN_KERJA",
  "PAKLARING",
  ...changeLetterTypes,
  "BERAKHIR_KONTRAK",
  "PANGGILAN",
];

const longDate = (v: string) =>
  v ? new Date(`${v}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";

export function EmployeeLetterForm({
  employeeId,
  templates,
  vars,
  defaultLastDay,
  activeWarning,
  departments,
  today,
}: {
  employeeId: string;
  templates: Partial<Record<LetterType, TemplateView>>;
  vars: LetterVars;
  defaultLastDay: string;
  activeWarning: { type: LetterType; validUntil: string } | null;
  departments: string[];
  today: string;
}) {
  const [state, action, pending] = useActionState<IssueState, FormData>(issueEmployeeLetter.bind(null, employeeId), undefined);
  const hydrated = useHydrated();
  const v = state?.values;
  const [type, setType] = useState<LetterType>((v?.type as LetterType) ?? "SURAT_KETERANGAN_KERJA");
  const [reason, setReason] = useState(v?.reason ?? "");
  const [purpose, setPurpose] = useState(v?.purpose ?? "");
  const [lastDay, setLastDay] = useState(v?.lastDay ?? defaultLastDay);
  // Mutasi / promosi / demosi
  const [change, setChange] = useState({
    newPosition: v?.newPosition ?? vars.jabatan ?? "",
    newDepartment: v?.newDepartment ?? vars.departemen ?? "",
    newLocation: v?.newLocation ?? "",
    effectiveDate: v?.effectiveDate ?? today,
    newSalary: v?.newSalary ?? "",
  });
  const [applyChange, setApplyChange] = useState(v ? v.applyChange === "on" : true);
  // Surat panggilan (mangkir)
  const [summons, setSummons] = useState({
    summonsRound: v?.summonsRound ?? "Pertama",
    absentSince: v?.absentSince ?? "",
    meetDate: v?.meetDate ?? "",
    meetTime: v?.meetTime ?? "09:00",
    meetPlace: v?.meetPlace ?? "",
    recipientAddress: v?.recipientAddress ?? vars.alamat ?? "",
  });
  const setS = (k: keyof typeof summons) => (ev: { target: { value: string } }) => setSummons({ ...summons, [k]: ev.target.value });
  const setC = (k: keyof typeof change) => (ev: { target: { value: string } }) => setChange({ ...change, [k]: ev.target.value });
  const e = state?.errors ?? {};
  const isSp = type === "SP1" || type === "SP2" || type === "SP3";
  const isChange = isChangeLetter(type);

  const previewVars: LetterVars = {
    ...vars,
    alasan: reason,
    keperluan: purpose,
    berlaku_hingga: isSp ? "(6 bulan sejak tanggal surat)" : "",
    tanggal_berakhir: type === "PAKLARING" && lastDay ? longDate(lastDay) : vars.tanggal_berakhir,
    tanggal_surat: new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }),
    jabatan_baru: change.newPosition,
    departemen_baru: change.newDepartment,
    lokasi_baru: change.newLocation,
    tanggal_efektif: longDate(change.effectiveDate),
    gaji_baru: change.newSalary
      ? `${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(change.newSalary))} per bulan`
      : SALARY_UNCHANGED_TEXT,
    panggilan_ke: summons.summonsRound,
    tidak_masuk_sejak: longDate(summons.absentSince),
    tanggal_menghadap: summons.meetDate
      ? new Date(`${summons.meetDate}T00:00:00Z`).toLocaleDateString("id-ID", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })
      : "",
    jam_menghadap: summons.meetTime.replace(":", "."),
    tempat_menghadap: summons.meetPlace,
    alamat: type === "PANGGILAN" ? summons.recipientAddress : vars.alamat,
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <form action={action} onSubmit={submitWithoutReset(action)} className="space-y-3">
        <FormMessage message={state?.message} />
        <IssuedNotice state={state} />
        <Field label="Jenis surat" htmlFor="type" errors={e.type}>
          <select id="type" name="type" value={type} onChange={(ev) => setType(ev.target.value as LetterType)} className={inputClass}>
            {employeeLetterTypes.map((t) => (
              <option key={t} value={t}>
                {letterTypeLabel[t]}
              </option>
            ))}
          </select>
        </Field>

        {isSp && activeWarning && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Masih ada {letterTypeLabel[activeWarning.type]} yang berlaku sampai {activeWarning.validUntil}.
          </p>
        )}
        {isChange && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Jabatan baru" htmlFor="newPosition" hint={`Sekarang: ${vars.jabatan}`} errors={e.newPosition}>
                <input id="newPosition" name="newPosition" value={change.newPosition} onChange={setC("newPosition")} className={inputClass} />
              </Field>
              <Field label="Departemen baru" htmlFor="newDepartment" hint={`Sekarang: ${vars.departemen}`} errors={e.newDepartment}>
                <input
                  id="newDepartment"
                  name="newDepartment"
                  list="newDepartment-options"
                  autoComplete="off"
                  value={change.newDepartment}
                  onChange={setC("newDepartment")}
                  className={inputClass}
                />
                <datalist id="newDepartment-options">
                  {departments.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </Field>
              {type === "MUTASI" && (
                <Field label="Lokasi kerja baru" htmlFor="newLocation" hint="Misal: Kantor Cabang Surabaya." errors={e.newLocation}>
                  <input id="newLocation" name="newLocation" value={change.newLocation} onChange={setC("newLocation")} className={inputClass} />
                </Field>
              )}
              <Field label="Berlaku mulai" htmlFor="effectiveDate" errors={e.effectiveDate}>
                <input id="effectiveDate" name="effectiveDate" type="date" value={change.effectiveDate} onChange={setC("effectiveDate")} className={inputClass} />
              </Field>
              {type !== "MUTASI" && (
                <Field
                  label="Gaji pokok baru (opsional)"
                  htmlFor="newSalary"
                  hint="Hanya dicetak di PDF. Kosong = “sesuai ketentuan perusahaan”."
                  errors={e.newSalary}
                >
                  <input id="newSalary" name="newSalary" type="number" min={0} step={100000} value={change.newSalary} onChange={setC("newSalary")} className={inputClass} />
                </Field>
              )}
            </div>
            <Field
              label="Pertimbangan"
              htmlFor="reason"
              hint={
                type === "DEMOSI"
                  ? "Dasar demosi: hasil evaluasi kinerja, SP terkait, pasal Peraturan Perusahaan. Pastikan sudah sesuai PP/PKB."
                  : type === "PROMOSI"
                    ? "Misal: hasil penilaian kinerja 2026 sangat baik dan kebutuhan posisi Supervisor."
                    : "Misal: kebutuhan tenaga kerja di cabang Surabaya."
              }
              errors={e.reason}
            >
              <textarea id="reason" name="reason" rows={3} value={reason} onChange={(ev) => setReason(ev.target.value)} className={inputClass} />
            </Field>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="applyChange"
                checked={applyChange}
                onChange={(ev) => setApplyChange(ev.target.checked)}
                className="mt-0.5 size-4 accent-brand-700"
              />
              Perbarui jabatan dan departemen di data karyawan saat surat terbit. Kosongkan jika tanggal berlaku masih lama, lalu ubah
              nanti di Data kepegawaian.
            </label>
          </>
        )}
        {isSp && (
          <Field
            label="Uraian pelanggaran"
            htmlFor="reason"
            hint="Tulis faktanya: apa, kapan, dan pasal peraturan perusahaan yang dilanggar."
            errors={e.reason}
          >
            <textarea id="reason" name="reason" rows={5} value={reason} onChange={(ev) => setReason(ev.target.value)} className={inputClass} />
          </Field>
        )}
        {type === "SURAT_KETERANGAN_KERJA" && (
          <Field label="Keperluan" htmlFor="purpose" hint="Misal: pengajuan KPR, pembuatan visa." errors={e.purpose}>
            <input id="purpose" name="purpose" value={purpose} onChange={(ev) => setPurpose(ev.target.value)} className={inputClass} />
          </Field>
        )}
        {type === "BERAKHIR_KONTRAK" &&
          (vars.tanggal_berakhir ? (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Kontrak {vars.nomor_kontrak || "terakhir"} berakhir {vars.tanggal_berakhir}. Data diambil dari Riwayat kontrak; tidak ada isian
              tambahan.
            </p>
          ) : (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Karyawan ini tidak punya tanggal berakhir kontrak. Surat ini hanya untuk kontrak PKWT.
            </p>
          ))}
        {type === "PANGGILAN" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Panggilan ke-" htmlFor="summonsRound" hint="Setelah 2 kali dipanggil secara tertulis." errors={e.summonsRound}>
                <select id="summonsRound" name="summonsRound" value={summons.summonsRound} onChange={setS("summonsRound")} className={inputClass}>
                  {summonsRounds.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tidak masuk sejak" htmlFor="absentSince" errors={e.absentSince}>
                <input id="absentSince" name="absentSince" type="date" max={today} value={summons.absentSince} onChange={setS("absentSince")} className={inputClass} />
              </Field>
              <Field label="Tanggal menghadap" htmlFor="meetDate" errors={e.meetDate}>
                <input id="meetDate" name="meetDate" type="date" min={today} value={summons.meetDate} onChange={setS("meetDate")} className={inputClass} />
              </Field>
              <Field label="Jam menghadap (WIB)" htmlFor="meetTime" errors={e.meetTime}>
                <input id="meetTime" name="meetTime" type="time" value={summons.meetTime} onChange={setS("meetTime")} className={inputClass} />
              </Field>
            </div>
            <Field label="Tempat menghadap" htmlFor="meetPlace" hint="Misal: Ruang HRD Lt. 2, Kantor Pusat." errors={e.meetPlace}>
              <input id="meetPlace" name="meetPlace" value={summons.meetPlace} onChange={setS("meetPlace")} className={inputClass} />
            </Field>
            <Field
              label="Alamat tujuan surat"
              htmlFor="recipientAddress"
              hint={
                vars.alamat
                  ? "Terisi dari alamat KTP. Ganti jika karyawan tinggal di alamat lain (domisili), supaya surat sampai."
                  : "Alamat KTP belum diisi di Data pribadi. Tulis alamat tempat tinggal karyawan."
              }
              errors={e.recipientAddress}
            >
              <textarea
                id="recipientAddress"
                name="recipientAddress"
                rows={2}
                value={summons.recipientAddress}
                onChange={setS("recipientAddress")}
                className={inputClass}
              />
            </Field>
          </>
        )}
        {type === "PAKLARING" && (
          <Field label="Tanggal terakhir bekerja" htmlFor="lastDay" errors={e.lastDay}>
            <input id="lastDay" name="lastDay" type="date" value={lastDay} onChange={(ev) => setLastDay(ev.target.value)} className={inputClass} />
          </Field>
        )}

        <button type="submit" disabled={pending || !hydrated} className={buttonClass}>
          {pending ? "Menerbitkan…" : "Terbitkan surat"}
        </button>
        <p className="text-xs text-slate-500">Nomor surat dibuat otomatis saat terbit dan tidak bisa diubah.</p>
      </form>
      {templates[type] && <LetterPreview template={templates[type]!} vars={previewVars} />}
    </div>
  );
}

export function OfferLetterForm({
  applicationId,
  template,
  vars,
  defaults,
}: {
  applicationId: string;
  template: TemplateView;
  vars: LetterVars;
  defaults: { location: string; employmentType: EmploymentType };
}) {
  const [state, action, pending] = useActionState<IssueState, FormData>(issueOfferLetter.bind(null, applicationId), undefined);
  const hydrated = useHydrated();
  const [f, setF] = useState({
    salary: state?.values?.salary ?? "",
    startDate: state?.values?.startDate ?? "",
    confirmBy: state?.values?.confirmBy ?? "",
    location: state?.values?.location ?? defaults.location,
    employmentType: (state?.values?.employmentType as EmploymentType) ?? defaults.employmentType,
  });
  const e = state?.errors ?? {};
  const set = (k: keyof typeof f) => (ev: { target: { value: string } }) => setF({ ...f, [k]: ev.target.value });

  const previewVars: LetterVars = {
    ...vars,
    gaji: f.salary ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(f.salary)) : "",
    tanggal_mulai: longDate(f.startDate),
    batas_konfirmasi: longDate(f.confirmBy),
    lokasi: f.location,
    status_kerja: employmentTypeLabel[f.employmentType],
    tanggal_surat: new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }),
  };

  return (
    <div className="space-y-4">
      <form action={action} onSubmit={submitWithoutReset(action)} className="space-y-3">
        <FormMessage message={state?.message} />
        <IssuedNotice state={state} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Gaji pokok (Rp/bulan)" htmlFor="salary" errors={e.salary}>
            <input id="salary" name="salary" type="number" min={0} step={100000} value={f.salary} onChange={set("salary")} className={inputClass} />
          </Field>
          <Field label="Status hubungan kerja" htmlFor="offerEmploymentType" errors={e.employmentType}>
            <select id="offerEmploymentType" name="employmentType" value={f.employmentType} onChange={set("employmentType")} className={inputClass}>
              {Object.entries(employmentTypeLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tanggal mulai bekerja" htmlFor="startDate" errors={e.startDate}>
            <input id="startDate" name="startDate" type="date" value={f.startDate} onChange={set("startDate")} className={inputClass} />
          </Field>
          <Field label="Batas konfirmasi" htmlFor="confirmBy" errors={e.confirmBy}>
            <input id="confirmBy" name="confirmBy" type="date" value={f.confirmBy} onChange={set("confirmBy")} className={inputClass} />
          </Field>
        </div>
        <Field label="Lokasi kerja" htmlFor="location" errors={e.location}>
          <input id="location" name="location" value={f.location} onChange={set("location")} className={inputClass} />
        </Field>
        <button type="submit" disabled={pending || !hydrated} className={buttonClass}>
          {pending ? "Menerbitkan…" : "Terbitkan surat penawaran"}
        </button>
      </form>
      <LetterPreview template={template} vars={previewVars} />
    </div>
  );
}

export function TemplateEditor({ type, template, sampleVars }: { type: LetterType; template: TemplateView & { version: number }; sampleVars: LetterVars }) {
  const [state, action, pending] = useActionState(saveTemplate.bind(null, type), undefined);
  const hydrated = useHydrated();
  const [name, setName] = useState(template.name);
  const [body, setBody] = useState(template.body);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <form action={action} onSubmit={submitWithoutReset(action)} className="space-y-3">
        <FormMessage message={state?.message} />
        {state?.ok && <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-800">Tersimpan sebagai versi baru.</p>}
        <Field label="Judul surat" htmlFor={`name-${type}`} errors={state?.errors?.name}>
          <input id={`name-${type}`} name="name" value={name} onChange={(ev) => setName(ev.target.value)} className={inputClass} />
        </Field>
        <Field
          label={`Isi surat (versi ${template.version})`}
          htmlFor={`body-${type}`}
          hint="Baris kosong = paragraf baru. Baris berbentuk “Label : isi” ditata sebagai tabel."
          errors={state?.errors?.body}
        >
          <textarea
            id={`body-${type}`}
            name="body"
            rows={18}
            value={body}
            onChange={(ev) => setBody(ev.target.value)}
            className={`${inputClass} font-mono text-xs`}
          />
        </Field>
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer">Daftar isian yang tersedia</summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {Object.entries(placeholderHelp).map(([k, v]) => (
              <li key={k}>
                <code className="rounded bg-slate-100 px-1">{`{{${k}}}`}</code> {v}
              </li>
            ))}
          </ul>
        </details>
        <button type="submit" disabled={pending || !hydrated} className={buttonClass}>
          {pending ? "Menyimpan…" : "Simpan sebagai versi baru"}
        </button>
      </form>
      <LetterPreview template={{ name, body }} vars={sampleVars} />
    </div>
  );
}

// <details> whose open state belongs to the browser. A plain open={…} from the server
// would snap shut on refresh() after the first letter, hiding the "issued" notice.
export function Disclosure({
  summary,
  defaultOpen,
  className,
  children,
}: {
  summary: string;
  defaultOpen: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className={className} open={open} onToggle={(ev) => setOpen(ev.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-medium text-brand-800">{summary}</summary>
      {children}
    </details>
  );
}

export function LettersNav() {
  return (
    <div className="flex gap-4 text-sm">
      <Link href="/dashboard/surat" className="text-brand-700 hover:underline">
        Daftar surat
      </Link>
      <Link href="/dashboard/surat/template" className="text-brand-700 hover:underline">
        Template surat
      </Link>
    </div>
  );
}
