"use client";

import { useActionState, useState, useTransition } from "react";
import { generateCandidateQuestions } from "@/app/actions/interview-kits";
import { hireCandidate } from "@/app/actions/employees";
import { cancelInterview, rescheduleInterview, scheduleInterview, setNoShow, submitFeedback } from "@/app/actions/interviews";
import { Field, FormMessage, inputClass } from "@/app/ui/field";
import { WorkLocationFields } from "@/app/ui/work-location-fields";
import { decisionLabel, employmentTypeLabel, interviewModeLabel } from "@/lib/labels";
import type { EmploymentType } from "@/generated/prisma/enums";

const buttonClass =
  "rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60";

type Option = { id: string; name: string };

type Reschedule = {
  interviewId: string;
  // The old slot's settings; the new date and time are always typed fresh
  defaults: { interviewerId: string; durationMin: number; mode: string; locationOrLink: string };
};

// Schedules a new interview, or with `reschedule` moves an existing one to a new slot
export function ScheduleInterviewForm({
  applicationId,
  interviewers,
  defaultInterviewerId,
  reschedule,
}: {
  applicationId: string;
  interviewers: Option[];
  defaultInterviewerId: string;
  reschedule?: Reschedule;
}) {
  const [state, action, pending] = useActionState(
    reschedule ? rescheduleInterview.bind(null, reschedule.interviewId) : scheduleInterview.bind(null, applicationId),
    undefined,
  );
  const e = state?.errors ?? {};
  const d = reschedule?.defaults;
  // After success the form remounts empty; after an error it keeps what was typed
  const v = (name: string, fallback = "") => (state?.ok ? fallback : (state?.values?.[name] ?? fallback));
  const idPrefix = reschedule ? `rs-${reschedule.interviewId}-` : "";

  return (
    <form key={state?.attempt} action={action} className="space-y-3">
      <FormMessage message={state?.message} />
      {state?.ok && !reschedule && <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-800">Wawancara dijadwalkan.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={reschedule ? "Tanggal & jam baru (WIB)" : "Tanggal & jam (WIB)"} htmlFor={`${idPrefix}scheduledAt`} errors={e.scheduledAt}>
          <input id={`${idPrefix}scheduledAt`} name="scheduledAt" type="datetime-local" required defaultValue={v("scheduledAt")} className={inputClass} />
        </Field>
        <Field label="Durasi (menit)" htmlFor={`${idPrefix}durationMin`} errors={e.durationMin}>
          <input
            id={`${idPrefix}durationMin`}
            name="durationMin"
            type="number"
            min={15}
            max={480}
            step={15}
            defaultValue={v("durationMin", String(d?.durationMin ?? 60))}
            className={inputClass}
          />
        </Field>
        <Field label="Pewawancara" htmlFor={`${idPrefix}interviewerId`} errors={e.interviewerId}>
          <select
            id={`${idPrefix}interviewerId`}
            name="interviewerId"
            defaultValue={v("interviewerId", d?.interviewerId ?? defaultInterviewerId)}
            className={inputClass}
          >
            {interviewers.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Jenis" htmlFor={`${idPrefix}mode`} errors={e.mode}>
          <select id={`${idPrefix}mode`} name="mode" defaultValue={v("mode", d?.mode ?? "ONLINE")} className={inputClass}>
            {Object.entries(interviewModeLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Lokasi atau tautan meeting" htmlFor={`${idPrefix}locationOrLink`} errors={e.locationOrLink}>
        <input
          id={`${idPrefix}locationOrLink`}
          name="locationOrLink"
          required
          placeholder="https://meet.google.com/… atau Ruang Rapat Lt. 3"
          defaultValue={v("locationOrLink", d?.locationOrLink ?? "")}
          className={inputClass}
        />
      </Field>
      <button type="submit" disabled={pending} className={buttonClass}>
        {reschedule ? (pending ? "Menyimpan…" : "Simpan jadwal baru") : pending ? "Menjadwalkan…" : "Jadwalkan wawancara"}
      </button>
    </form>
  );
}

export function FeedbackForm({ interviewId }: { interviewId: string }) {
  const [state, action, pending] = useActionState(submitFeedback.bind(null, interviewId), undefined);
  const e = state?.errors ?? {};
  const v = (name: string) => state?.values?.[name] ?? "";

  return (
    <form key={state?.attempt} action={action} className="space-y-3">
      <FormMessage message={state?.message} />
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Nilai (1 = kurang, 5 = sangat baik)</legend>
        <div className="mt-1 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className="flex size-9 cursor-pointer items-center justify-center rounded-md border border-slate-300 text-sm has-[:checked]:border-brand-700 has-[:checked]:bg-brand-50"
            >
              <input type="radio" name="rating" value={n} defaultChecked={v("rating") === String(n)} className="sr-only" />
              {n}
            </label>
          ))}
        </div>
        {e.rating?.map((m) => (
          <p key={m} className="mt-1 text-xs text-red-700">
            {m}
          </p>
        ))}
      </fieldset>
      <Field label="Rekomendasi" htmlFor={`recommendation-${interviewId}`} errors={e.recommendation}>
        <select id={`recommendation-${interviewId}`} name="recommendation" defaultValue={v("recommendation")} className={inputClass}>
          <option value="">Pilih…</option>
          {Object.entries(decisionLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Catatan wawancara" htmlFor={`feedback-${interviewId}`} errors={e.feedback}>
        <textarea id={`feedback-${interviewId}`} name="feedback" rows={3} defaultValue={v("feedback")} className={inputClass} />
      </Field>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Menyimpan…" : "Simpan penilaian"}
      </button>
    </form>
  );
}

export function CancelInterviewButton({ interviewId }: { interviewId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Batalkan wawancara ini?")) return;
        startTransition(async () => {
          const result = await cancelInterview(interviewId);
          if (result?.message) alert(result.message);
        });
      }}
      className="text-xs text-red-700 hover:underline disabled:opacity-60"
    >
      {pending ? "Membatalkan…" : "Batalkan"}
    </button>
  );
}

// "No show" after the interview time; with undo, takes back a mistaken mark
export function NoShowButton({ interviewId, undo = false }: { interviewId: string; undo?: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(undo ? "Batalkan tanda No show? Wawancara kembali berstatus Terjadwal." : "Tandai kandidat tidak hadir (No show)?")) return;
        startTransition(async () => {
          const result = await setNoShow(interviewId, !undo);
          if (result?.message) alert(result.message);
        });
      }}
      className={`text-xs hover:underline disabled:opacity-60 ${undo ? "text-slate-600" : "text-red-700"}`}
    >
      {pending ? "Menyimpan…" : undo ? "Batalkan tanda No show" : "No show"}
    </button>
  );
}

export function GenerateQuestionsButton({ applicationId, hasQuestions }: { applicationId: string; hasQuestions: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await generateCandidateQuestions(applicationId);
            setError(r.error ?? null);
          })
        }
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? "AI sedang menyusun…" : hasQuestions ? "Buat ulang dengan AI" : "Buat pertanyaan khusus dengan AI"}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}

export function HireForm({
  applicationId,
  departments,
  defaults,
}: {
  applicationId: string;
  departments: Option[];
  defaults: { departmentId: string; position: string; employmentType: EmploymentType };
}) {
  const [state, action, pending] = useActionState(hireCandidate.bind(null, applicationId), undefined);
  const e = state?.errors ?? {};
  const v = (name: string, fallback = "") => state?.values?.[name] ?? fallback;

  return (
    <form key={state?.attempt} action={action} className="space-y-3">
      <FormMessage message={state?.message} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Employee ID" htmlFor="employeeNumber" errors={e.employeeNumber}>
          <input id="employeeNumber" name="employeeNumber" required defaultValue={v("employeeNumber")} className={inputClass} />
        </Field>
        <Field label="Nomor kontrak" htmlFor="contractNumber" errors={e.contractNumber}>
          <input id="contractNumber" name="contractNumber" required defaultValue={v("contractNumber")} className={inputClass} />
        </Field>
        <Field label="Departemen" htmlFor="hireDepartmentId" errors={e.departmentId}>
          <select id="hireDepartmentId" name="departmentId" defaultValue={v("departmentId", defaults.departmentId)} className={inputClass}>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Jabatan" htmlFor="position" errors={e.position}>
          <input id="position" name="position" required defaultValue={v("position", defaults.position)} className={inputClass} />
        </Field>
        <WorkLocationFields idPrefix="hire-" location={v("workLocation")} warehouse={v("warehouse")} errors={e} />
        <Field label="Jenis hubungan kerja" htmlFor="hireEmploymentType" errors={e.employmentType}>
          <select
            id="hireEmploymentType"
            name="employmentType"
            defaultValue={v("employmentType", defaults.employmentType)}
            className={inputClass}
          >
            {Object.entries(employmentTypeLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mulai bekerja" htmlFor="joinDate" errors={e.joinDate}>
          <input id="joinDate" name="joinDate" type="date" required defaultValue={v("joinDate")} className={inputClass} />
        </Field>
        <Field label="Kontrak berakhir" htmlFor="endDate" hint="Wajib untuk PKWT." errors={e.endDate}>
          <input id="endDate" name="endDate" type="date" defaultValue={v("endDate")} className={inputClass} />
        </Field>
        <Field label="Mulai training" htmlFor="hireTrainStart" errors={e.trainingStart}>
          <input id="hireTrainStart" name="trainingStart" type="date" defaultValue={v("trainingStart")} className={inputClass} />
        </Field>
        <Field
          label="Selesai training"
          htmlFor="hireTrainEnd"
          hint="Kosongkan jika tidak training. Selama training, Employee ID berawalan huruf T lalu angka (misal T001)."
          errors={e.trainingEnd}
        >
          <input id="hireTrainEnd" name="trainingEnd" type="date" defaultValue={v("trainingEnd")} className={inputClass} />
        </Field>
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Menyimpan…" : "Buat data karyawan"}
      </button>
    </form>
  );
}
