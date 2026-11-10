"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { approveJobKit, generateJobKit, saveJobKit, type KitActionResult } from "@/app/actions/interview-kits";
import { inputClass } from "@/app/ui/field";
import { emptyQuestion, questionTypes, type JobKit, type KitQuestionT } from "@/lib/interview-kit-schema";

const buttonClass =
  "rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60";
const secondaryClass =
  "rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60";

const typeLabel: Record<(typeof questionTypes)[number], string> = {
  perilaku: "Perilaku (pengalaman nyata)",
  situasional: "Situasional (skenario)",
  teknis: "Teknis",
};

const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

// One item per line in a textarea <-> string[]
const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);

export function KitEditor({
  jobId,
  initial,
  aiEnabled,
  canApprove,
  status,
}: {
  jobId: string;
  initial: JobKit | null;
  aiEnabled: boolean;
  canApprove: boolean;
  status: "DRAFT" | "APPROVED" | null;
}) {
  const [kit, setKit] = useState<JobKit>(initial ?? { competencies: [], questions: [emptyQuestion()], notes: "" });
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<KitActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const busy = pending || !hydrated;

  const update = (next: JobKit) => {
    setKit(next);
    setDirty(true);
    setResult(null);
  };
  const setQ = (i: number, patch: Partial<KitQuestionT>) =>
    update({ ...kit, questions: kit.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });

  const run = (fn: () => Promise<KitActionResult>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) after?.();
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {aiEnabled ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if ((initial || dirty) && !confirm("Ganti isi panduan dengan draf baru dari AI?")) return;
              run(() => generateJobKit(jobId), () => setDirty(false));
            }}
            className={secondaryClass}
          >
            {pending ? "Memproses…" : initial ? "Buat ulang dengan AI" : "Buat draf dengan AI"}
          </button>
        ) : (
          <span className="text-xs text-slate-500">AI belum aktif (isi ANTHROPIC_API_KEY); panduan bisa disusun manual.</span>
        )}
      </div>

      {result?.error && (
        <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {result.error}
          {result.issues && (
            <ul className="mt-1 list-disc pl-5">
              {result.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {result?.ok && !dirty && <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-800">Tersimpan.</p>}

      <label className="block text-sm">
        <span className="font-medium text-slate-700">Kompetensi yang dinilai (satu per baris)</span>
        <textarea
          rows={3}
          value={kit.competencies.join("\n")}
          onChange={(e) => update({ ...kit, competencies: e.target.value.split("\n") })}
          className={inputClass}
        />
      </label>

      <ol className="space-y-4">
        {kit.questions.map((q, i) => (
          <li key={i} className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">Pertanyaan {i + 1}</p>
              <button
                type="button"
                onClick={() => update({ ...kit, questions: kit.questions.filter((_, j) => j !== i) })}
                className="text-xs text-red-700 hover:underline"
              >
                Hapus
              </button>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-slate-600">Kompetensi</span>
                <input value={q.competency} onChange={(e) => setQ(i, { competency: e.target.value })} className={inputClass} />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Jenis</span>
                <select value={q.type} onChange={(e) => setQ(i, { type: e.target.value as KitQuestionT["type"] })} className={inputClass}>
                  {questionTypes.map((t) => (
                    <option key={t} value={t}>
                      {typeLabel[t]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-3 block text-sm">
              <span className="text-slate-600">Pertanyaan</span>
              <textarea rows={2} value={q.question} onChange={(e) => setQ(i, { question: e.target.value })} className={inputClass} />
            </label>
            <label className="mt-3 block text-sm">
              <span className="text-slate-600">Tanda jawaban baik (satu per baris)</span>
              <textarea rows={3} value={q.lookFor.join("\n")} onChange={(e) => setQ(i, { lookFor: e.target.value.split("\n") })} className={inputClass} />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {(["kurang", "cukup", "baik"] as const).map((level, k) => (
                <label key={level} className="text-sm">
                  <span className="text-slate-600">
                    Nilai {[1, 3, 5][k]} ({level})
                  </span>
                  <textarea
                    rows={3}
                    value={q.rubric[level]}
                    onChange={(e) => setQ(i, { rubric: { ...q.rubric, [level]: e.target.value } })}
                    className={inputClass}
                  />
                </label>
              ))}
            </div>
            <label className="mt-3 block text-sm">
              <span className="text-slate-600">Pertanyaan pendalaman (opsional, satu per baris)</span>
              <textarea rows={2} value={q.followUps.join("\n")} onChange={(e) => setQ(i, { followUps: e.target.value.split("\n") })} className={inputClass} />
            </label>
          </li>
        ))}
      </ol>

      <button type="button" onClick={() => update({ ...kit, questions: [...kit.questions, emptyQuestion()] })} className={secondaryClass}>
        + Tambah pertanyaan
      </button>

      <label className="block text-sm">
        <span className="font-medium text-slate-700">Catatan untuk pewawancara</span>
        <textarea rows={2} value={kit.notes} onChange={(e) => update({ ...kit, notes: e.target.value })} className={inputClass} />
      </label>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(
              () =>
                saveJobKit(
                  jobId,
                  JSON.stringify({
                    ...kit,
                    competencies: lines(kit.competencies.join("\n")),
                    questions: kit.questions.map((q) => ({ ...q, lookFor: lines(q.lookFor.join("\n")), followUps: lines(q.followUps.join("\n")) })),
                  }),
                ),
              () => setDirty(false),
            )
          }
          className={buttonClass}
        >
          {pending ? "Menyimpan…" : "Simpan draf"}
        </button>
        {canApprove && status === "DRAFT" && !dirty && (
          <button type="button" disabled={busy} onClick={() => run(() => approveJobKit(jobId))} className={secondaryClass}>
            Setujui untuk dipakai
          </button>
        )}
        {dirty && <span className="text-xs text-amber-700">Ada perubahan yang belum disimpan.</span>}
      </div>
    </div>
  );
}
