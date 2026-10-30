import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { formatDate, sourceLabel, stageLabel } from "@/lib/labels";
import type { ScreeningProfile } from "@/lib/screening";
import { AttachToJobForm } from "../bank-forms";

export const metadata: Metadata = { title: "Profil kandidat" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900">{children}</dd>
    </div>
  );
}

export default async function CandidateProfilePage({ params, searchParams }: PageProps<"/dashboard/kandidat/bank/[candidateId]">) {
  await requireRole("ADMIN", "HR");
  const { candidateId } = await params;
  const { baru } = await searchParams;

  const c = await db.candidate.findUnique({
    where: { id: candidateId },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      city: true,
      lastEducation: true,
      source: true,
      consentAt: true,
      consentVersion: true,
      consentMethod: true,
      consentEvidence: true,
      consentRecordedBy: { select: { name: true } },
      talentPoolConsent: true,
      retainUntil: true,
      anonymizedAt: true,
      createdAt: true,
      resumes: { orderBy: { uploadedAt: "desc" }, take: 1, select: { fileName: true, uploadedAt: true, parsedData: true } },
      applications: {
        orderBy: { appliedAt: "desc" },
        select: {
          id: true,
          stage: true,
          appliedAt: true,
          source: true,
          jobId: true,
          job: { select: { title: true } },
          screenings: { orderBy: { createdAt: "desc" }, take: 1, select: { score: true } },
          resumes: { orderBy: { uploadedAt: "desc" }, take: 1, select: { fileName: true, uploadedAt: true, parsedData: true } },
        },
      },
    },
  });
  if (!c) notFound();

  // Latest CV, whether stored on the candidate (added by HR) or on an application
  const cv = [c.resumes[0], ...c.applications.map((a) => a.resumes[0])]
    .filter(Boolean)
    .sort((a, b) => b!.uploadedAt.getTime() - a!.uploadedAt.getTime())[0];
  const profile = cv?.parsedData as ScreeningProfile | null | undefined;

  const appliedJobIds = c.applications.map((a) => a.jobId);
  const openJobs = c.anonymizedAt
    ? []
    : await db.job.findMany({
        where: { status: "OPEN", id: { notIn: appliedJobIds } },
        orderBy: { title: "asc" },
        select: { id: true, title: true },
      });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/kandidat/bank" className="text-sm text-teal-700 hover:underline">
          ← Bank data kandidat
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">{c.fullName}</h1>
          {c.talentPoolConsent && <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-800">talent pool</span>}
        </div>
        <p className="text-sm text-slate-500">
          Masuk bank data {formatDate(c.createdAt)} · sumber: {sourceLabel(c.source ?? c.applications.at(-1)?.source)}
        </p>
        {baru === "1" && (
          <p role="status" className="mt-3 rounded-md bg-teal-50 px-4 py-3 text-sm text-teal-800">
            Kandidat tersimpan di bank data.
          </p>
        )}
        {c.anonymizedAt && (
          <p className="mt-3 rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-700">
            Data pribadi kandidat ini sudah dihapus pada {formatDate(c.anonymizedAt)} sesuai masa simpan data.
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-medium text-slate-900">Lamaran</h2>
            {c.applications.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">Belum dimasukkan ke lowongan mana pun.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {c.applications.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <Link href={`/dashboard/kandidat/${a.id}`} className="font-medium text-teal-800 hover:underline">
                      {a.job.title}
                    </Link>
                    <span className="text-slate-600">
                      {stageLabel[a.stage]} · {formatDate(a.appliedAt)}
                      {a.screenings[0] && ` · skor AI ${a.screenings[0].score}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {!c.anonymizedAt && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <h3 className="mb-2 text-sm font-medium text-slate-900">Masukkan ke lowongan</h3>
                <AttachToJobForm candidateId={c.id} jobs={openJobs.map((j) => ({ id: j.id, name: j.title }))} />
                <p className="mt-2 text-xs text-slate-500">CV terakhir dipakai, lalu dinilai AI untuk lowongan tersebut.</p>
              </div>
            )}
          </section>

          {profile && (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-medium text-slate-900">Ringkasan CV</h2>
              <dl className="mt-2 divide-y divide-slate-100">
                <Row label="Pendidikan">{profile.highestEducation ?? "-"}</Row>
                <Row label="Total pengalaman">{profile.totalExperienceYears !== null ? `${profile.totalExperienceYears} tahun` : "-"}</Row>
                <Row label="Keahlian">{profile.skills.length ? profile.skills.join(", ") : "-"}</Row>
              </dl>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-medium text-slate-900">Data kandidat</h2>
            <dl className="mt-2 divide-y divide-slate-100">
              <Row label="Email">{c.email}</Row>
              <Row label="Telepon">{c.phone}</Row>
              <Row label="Kota">{c.city ?? "-"}</Row>
              <Row label="Pendidikan">{c.lastEducation ?? "-"}</Row>
            </dl>
            {cv && !c.anonymizedAt && (
              <a
                href={`/dashboard/kandidat/bank/${c.id}/cv`}
                className="mt-4 block truncate rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Unduh CV · {cv.fileName}
              </a>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            <h2 className="font-medium text-slate-900">Persetujuan data (UU PDP)</h2>
            <p className="mt-2">
              {c.consentMethod === "HR_ATTESTED"
                ? `Dicatat oleh ${c.consentRecordedBy?.name ?? "HR"}: "${c.consentEvidence}"`
                : "Disetujui sendiri oleh kandidat di formulir lamaran."}
            </p>
            <p className="mt-1">
              {formatDate(c.consentAt)} · versi pemberitahuan {c.consentVersion}
            </p>
            <p className="mt-1">Data dihapus otomatis setelah {formatDate(c.retainUntil)}.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
