"use client";

import { useActionState } from "react";
import { changeStage, rescreen, reviewScreening } from "@/app/actions/candidates";
import { Field, FormMessage, inputClass } from "@/app/ui/field";
import { decisionLabel, stageLabel } from "@/lib/labels";
import type { ApplicationStage, ScreeningDecision } from "@/generated/prisma/enums";

const buttonClass =
  "rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60";

export function StageForm({ applicationId, stage }: { applicationId: string; stage: ApplicationStage }) {
  const [state, action, pending] = useActionState(changeStage.bind(null, applicationId), undefined);
  const current = state?.values?.stage ?? stage;

  return (
    <form key={state?.attempt} action={action} className="space-y-3">
      <FormMessage message={state?.message} />
      <Field label="Pindahkan ke tahap" htmlFor="stage" errors={state?.errors?.stage}>
        <select id="stage" name="stage" defaultValue={current} className={inputClass}>
          {Object.entries(stageLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Alasan penolakan"
        htmlFor="rejectionReason"
        hint="Wajib jika memilih Ditolak. Hanya untuk catatan internal."
        errors={state?.errors?.rejectionReason}
      >
        <textarea
          id="rejectionReason"
          name="rejectionReason"
          rows={2}
          defaultValue={state?.values?.rejectionReason}
          className={inputClass}
        />
      </Field>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Menyimpan…" : "Simpan tahap"}
      </button>
    </form>
  );
}

export function RescreenButton({ applicationId, hasScore }: { applicationId: string; hasScore: boolean }) {
  const [state, action, pending] = useActionState(rescreen.bind(null, applicationId), undefined);

  return (
    <form action={action} className="space-y-2">
      <FormMessage message={state?.message} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? "AI sedang menilai… (±30 detik)" : hasScore ? "Nilai ulang dengan AI" : "Nilai dengan AI"}
      </button>
    </form>
  );
}

export function ReviewForm({
  screeningId,
  decision,
  decisionNote,
}: {
  screeningId: string;
  decision: ScreeningDecision | null;
  decisionNote: string | null;
}) {
  const [state, action, pending] = useActionState(reviewScreening.bind(null, screeningId), undefined);
  const current = state?.values?.decision ?? decision ?? "";

  return (
    <form key={state?.attempt} action={action} className="space-y-3">
      <FormMessage message={state?.message} />
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Keputusan HR atas penilaian ini</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(decisionLabel).map(([value, label]) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm has-[:checked]:border-teal-700 has-[:checked]:bg-teal-50"
            >
              <input type="radio" name="decision" value={value} defaultChecked={current === value} className="accent-teal-700" />
              {label}
            </label>
          ))}
        </div>
        {state?.errors?.decision?.map((e) => (
          <p key={e} className="mt-1 text-xs text-red-700">
            {e}
          </p>
        ))}
      </fieldset>
      <Field label="Catatan" htmlFor="decisionNote" errors={state?.errors?.decisionNote}>
        <textarea
          id="decisionNote"
          name="decisionNote"
          rows={2}
          defaultValue={state?.values?.decisionNote ?? decisionNote ?? ""}
          className={inputClass}
        />
      </Field>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Menyimpan…" : "Simpan keputusan"}
      </button>
    </form>
  );
}
