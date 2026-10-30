"use client";

import { useActionState, useState, useTransition } from "react";
import { generateCandidateQuestions } from "@/app/actions/interview-kits";
import { hireCandidate } from "@/app/actions/employees";
import { cancelInterview, scheduleInterview, submitFeedback } from "@/app/actions/interviews";
import { Field, FormMessage, inputClass } from "@/app/ui/field";
import { decisionLabel, employmentTypeLabel, interviewModeLabel } from "@/lib/labels";
import type { EmploymentType } from "@/generated/prisma/enums";

const buttonClass =
  "rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60";

type Option = { id: string; name: string };

export function ScheduleInterviewForm({
  applicationId,
  interviewers,
  defaultInterviewerId,
}: {
  applicationId: string;
  interviewers: Option[];
  defaultInterviewerId: string;
}) {
  const [state, action, pending] = useActionState(scheduleInterview.bind(null, applicationId), undefined);
  const e = state?.errors ?? {};
  // After success the form remounts empty; after an error it keeps what was typed
  const v = (name: string, fallback = "") => (state?.ok ? fallback : (state?.values?.[name] ?? fallback));

  return (
    <form key={state?.attempt} action={action} className="space-y-3">
      <FormMessage message={state?.message} />
      {state?.ok && <p className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-800">Wawancara dijadwalkan.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tanggal & jam (WIB)" htmlFor="scheduledAt" errors={e.scheduledAt}>
          <input id="scheduledAt" name="scheduledAt" type="datetime-local" required defaultValue={v("scheduledAt")} className={inputClass} />
        </Field>
        <Field label="Durasi (menit)" htmlFor="durationMin" errors={e.durationMin}>
          <input id="durationMin" name="durationMin" type="number" min={15} max={480} step={15} defaultValue={v("durationMin", "60")} className={inputClass} />
        </Field>
        <Field label="Pewawancara" htmlFor="interviewerId" errors={e.interviewerId}>
          <select id="interviewerId" name="interviewerId" defaultValue={v("interviewerId", defaultInterviewerId)} className={inputClass}>
            {interviewers.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Jenis" htmlFor="mode" errors={e.mode}>
          <select id="mode" name="mode" defaultValue={v("mode", "ONLINE")} className={inputClass}>
            {Object.entries(interviewModeLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Lokasi atau tautan meeting" htmlFor="locationOrLink" errors={e.locationOrLink}>
        <input
          id="locationOrLink"
          name="locationOrLink"
          required
          placeholder="https://meet.google.com/… atau Ruang Rapat Lt. 3"
          defaultValue={v("locationOrLink")}
          className={inputClass}
        />
      </Field>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Menjadwalkan…" : "Jadwalkan wawancara"}
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
              className="flex size-9 cursor-pointer items-center justify-center rounded-md border border-slate-300 text-sm has-[:checked]:border-teal-700 has-[:checked]:bg-teal-50"
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
        <Field label="Nomor induk karyawan" htmlFor="employeeNumber" errors={e.employeeNumber}>
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
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Menyimpan…" : "Buat data karyawan"}
      </button>
    </form>
  );
}
