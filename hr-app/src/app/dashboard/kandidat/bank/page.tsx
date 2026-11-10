import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { educationLevels, formatDate, sourceLabel, stageLabel } from "@/lib/labels";
import type { ScreeningProfile } from "@/lib/screening";

export const metadata: Metadata = { title: "Bank data kandidat" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

const skillsOf = (parsed: unknown) => ((parsed as ScreeningProfile | null)?.skills ?? []).filter(Boolean);

export default async function CandidateBankPage({ searchParams }: PageProps<"/dashboard/kandidat/bank">) {
  await requireRole("ADMIN", "HR");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const pool = sp.pool === "1";
  // Result of an import (set by importCandidates' redirect)
  const imported = typeof sp.impor === "string" && /^\d+$/.test(sp.impor) ? Number(sp.impor) : null;
  const skipped = typeof sp.lewati === "string" && /^\d+$/.test(sp.lewati) ? Number(sp.lewati) : 0;
  const edu = typeof sp.pendidikan === "string" && (educationLevels as readonly string[]).includes(sp.pendidikan) ? sp.pendidikan : "";

  // ~20 applications a month: load the active bank and filter in memory, which also
  // lets the search look inside the AI-extracted skills (JSON)
  const candidates = await db.candidate.findMany({
    where: {
      anonymizedAt: null,
      ...(pool ? { talentPoolConsent: true } : {}),
      ...(edu ? { lastEducation: edu } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: {
      id: true,
      fullName: true,
      email: true,
      city: true,
      lastEducation: true,
      source: true,
      talentPoolConsent: true,
      retainUntil: true,
      createdAt: true,
      consentMethod: true,
      resumes: { orderBy: { uploadedAt: "desc" }, take: 1, select: { parsedData: true } },
      applications: {
        orderBy: { appliedAt: "desc" },
        select: {
          id: true,
          stage: true,
          source: true,
          job: { select: { title: true } },
          resumes: { orderBy: { uploadedAt: "desc" }, take: 1, select: { parsedData: true } },
          screenings: { orderBy: { createdAt: "desc" }, take: 1, select: { score: true } },
        },
      },
    },
  });

  const rows = candidates
    .map((c) => {
      const skills = [
        ...new Set([...skillsOf(c.resumes[0]?.parsedData), ...c.applications.flatMap((a) => skillsOf(a.resumes[0]?.parsedData))]),
      ];
      const best = c.applications.reduce<number | null>((m, a) => {
        const s = a.screenings[0]?.score;
        return s === undefined ? m : Math.max(m ?? 0, s);
      }, null);
      return { ...c, skills, bestScore: best, latest: c.applications[0] };
    })
    .filter((c) => {
      if (!q) return true;
      const hay = [c.fullName, c.email, c.city ?? "", ...c.skills, ...c.applications.map((a) => a.job.title)].join(" ").toLowerCase();
      return q.toLowerCase().split(/\s+/).every((term) => hay.includes(term));
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Bank data kandidat</h1>
          <p className="text-sm text-slate-500">Semua kandidat yang datanya masih disimpan, dari halaman karir maupun ditambahkan HR.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/kandidat/bank/import"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Import dari Excel
          </Link>
          <Link href="/dashboard/kandidat/bank/tambah" className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
            Tambah kandidat
          </Link>
        </div>
      </div>

      {imported !== null && (
        <p role="status" className="rounded-md bg-brand-50 px-4 py-3 text-sm text-brand-800">
          {imported} kandidat berhasil di-import
          {skipped > 0 && `, ${skipped} dilewati karena emailnya sudah ada di bank data`}. Unggah CV dari profil masing-masing sebelum
          memasukkan ke lowongan.
        </p>
      )}

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="min-w-56 flex-1 text-sm">
          <span className="text-slate-600">Cari nama, kota, keahlian, atau posisi</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="misal: payroll excel bandung"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600">Pendidikan</span>
          <select name="pendidikan" defaultValue={edu} className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Semua</option>
            {educationLevels.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" name="pool" value="1" defaultChecked={pool} className="size-4 accent-brand-700" />
          Hanya talent pool
        </label>
        <button type="submit" className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          Cari
        </button>
      </form>

      <p className="text-sm text-slate-500">{rows.length} kandidat</p>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Tidak ada kandidat yang cocok.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Kandidat</th>
                <th className="px-4 py-3 font-medium">Keahlian (dari CV)</th>
                <th className="px-4 py-3 font-medium">Lamaran terakhir</th>
                <th className="px-4 py-3 text-right font-medium">Skor AI</th>
                <th className="px-4 py-3 font-medium">Sumber</th>
                <th className="px-4 py-3 font-medium">Disimpan s.d.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/kandidat/bank/${c.id}`} className="font-medium text-brand-800 hover:underline">
                      {c.fullName}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {[c.lastEducation, c.city].filter(Boolean).join(" · ") || "-"}
                      {c.talentPoolConsent && <span className="ml-1 rounded bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-800">talent pool</span>}
                    </p>
                  </td>
                  <td className="max-w-64 px-4 py-3 text-xs text-slate-600">
                    {c.skills.length ? c.skills.slice(0, 5).join(", ") + (c.skills.length > 5 ? "…" : "") : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {c.latest ? (
                      <>
                        <Link href={`/dashboard/kandidat/${c.latest.id}`} className="hover:underline">
                          {c.latest.job.title}
                        </Link>
                        <p className="text-xs text-slate-500">{stageLabel[c.latest.stage]}</p>
                      </>
                    ) : (
                      <span className="text-slate-500">Belum dimasukkan ke lowongan</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.bestScore ?? "-"}</td>
                  {/* HR-added candidates carry their own source; careers-page ones have it on their first application */}
                  <td className="px-4 py-3 text-xs text-slate-600">{sourceLabel(c.source ?? c.applications.at(-1)?.source)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{formatDate(c.retainUntil)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
