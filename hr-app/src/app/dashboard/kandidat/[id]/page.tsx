import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { canAccessApplication, canManageApplication, requireUser } from "@/lib/dal";
import {
  applicationSources,
  decisionLabel,
  formatDate,
  formatDateTime,
  formatRupiah,
  interviewModeLabel,
  isFeedbackOpen,
  stageLabel,
} from "@/lib/labels";
import { isScreeningConfigured, type ScreeningProfile } from "@/lib/screening";
import { RescreenButton, ReviewForm, StageForm } from "./candidate-actions";
import { CancelInterviewButton, FeedbackForm, GenerateQuestionsButton, HireForm, ScheduleInterviewForm } from "./process-forms";
import { isAiConfigured } from "@/lib/ai";
import { CandidateQuestionsContent, JobKitContent } from "@/lib/interview-kit-schema";
import { activeTemplate } from "@/lib/letters/service";
import { offerLetterVars } from "@/lib/letters/vars";
import { OfferLetterForm } from "../../surat/letter-forms";

export const metadata: Metadata = { title: "Detail kandidat" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

function scoreStyle(score: number) {
  if (score >= 80) return "bg-teal-50 text-teal-800 ring-teal-200";
  if (score >= 60) return "bg-sky-50 text-sky-800 ring-sky-200";
  if (score >= 40) return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900">{children}</dd>
    </div>
  );
}

export default async function CandidateDetailPage({ params }: PageProps<"/dashboard/kandidat/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!(await canAccessApplication(user, id))) notFound();
  const canManage = await canManageApplication(user, id);
  const isHr = user.role === "ADMIN" || user.role === "HR";

  const app = await db.application.findUnique({
    where: { id },
    select: {
      id: true,
      stage: true,
      appliedAt: true,
      stageChangedAt: true,
      expectedSalary: true,
      noticePeriodDays: true,
      source: true,
      rejectionReason: true,
      candidate: {
        select: {
          fullName: true,
          email: true,
          phone: true,
          city: true,
          lastEducation: true,
          consentAt: true,
          consentVersion: true,
          talentPoolConsent: true,
          retainUntil: true,
          anonymizedAt: true,
        },
      },
      job: { select: { id: true, title: true, departmentId: true, employmentType: true } },
      employee: { select: { id: true, employeeNumber: true } },
      letters: { orderBy: { issuedAt: "desc" }, select: { id: true, letterNumber: true, issuedAt: true } },
      interviews: {
        orderBy: { scheduledAt: "asc" },
        select: {
          id: true,
          scheduledAt: true,
          durationMin: true,
          mode: true,
          locationOrLink: true,
          rating: true,
          recommendation: true,
          feedback: true,
          interviewerId: true,
          interviewer: { select: { name: true } },
        },
      },
      resumes: {
        orderBy: { uploadedAt: "desc" },
        take: 1,
        select: { fileName: true, sizeBytes: true, uploadedAt: true, parsedData: true },
      },
      screenings: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          score: true,
          summary: true,
          strengths: true,
          gaps: true,
          aiModel: true,
          createdAt: true,
          decision: true,
          decisionNote: true,
          reviewedAt: true,
          reviewedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!app) notFound();

  const { candidate } = app;
  const resume = app.resumes[0];
  const profile = resume?.parsedData as ScreeningProfile | null | undefined;
  const [latest, ...older] = app.screenings;
  const canRescreen = isHr && Boolean(resume) && !candidate.anonymizedAt;
  const canSchedule = canManage && ["APPLIED", "SCREENING", "INTERVIEW", "OFFER"].includes(app.stage);
  const showHireForm = isHr && app.stage === "HIRED" && !app.employee && !candidate.anonymizedAt;
  const showOfferForm = isHr && app.stage === "OFFER" && !candidate.anonymizedAt;
  const offerTemplate = showOfferForm ? await activeTemplate("OFFER_LETTER") : null;
  const offerVars = showOfferForm ? await offerLetterVars(app.id) : null;

  // Interview guide: the job's approved kit for everyone with access, plus candidate-specific questions
  const jobKitRow = await db.interviewKit.findFirst({
    where: { jobId: app.job.id, applicationId: null, status: "APPROVED" },
    select: { content: true },
  });
  const candidateKitRow = await db.interviewKit.findUnique({ where: { applicationId: app.id }, select: { content: true, aiModel: true } });
  const jobKit = jobKitRow ? JobKitContent.safeParse(jobKitRow.content) : null;
  const candidateQs = candidateKitRow ? CandidateQuestionsContent.safeParse(candidateKitRow.content) : null;
  const canGenerateQuestions = canManage && isAiConfigured() && Boolean(latest) && !candidate.anonymizedAt;

  const [interviewers, departments] = await Promise.all([
    canSchedule
      ? db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : [],
    showHireForm ? db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href={user.role === "EMPLOYEE" ? "/dashboard" : "/dashboard/kandidat"} className="text-sm text-teal-700 hover:underline">
          ← {user.role === "EMPLOYEE" ? "Ringkasan" : "Semua kandidat"}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">{candidate.fullName}</h1>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
            {stageLabel[app.stage]}
          </span>
        </div>
        <p className="text-sm text-slate-500">
          {app.job.title} · melamar {formatDate(app.appliedAt)}
        </p>
        {candidate.anonymizedAt && (
          <p className="mt-3 rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-700">
            Data pribadi kandidat ini sudah dihapus pada {formatDate(candidate.anonymizedAt)} sesuai masa simpan data.
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="font-medium text-slate-900">Penilaian AI</h2>
              {canRescreen && isScreeningConfigured() && (
                <RescreenButton applicationId={app.id} hasScore={Boolean(latest)} />
              )}
            </div>

            {!latest ? (
              <p className="mt-3 text-sm text-slate-600">
                {isScreeningConfigured()
                  ? "Belum ada penilaian AI untuk lamaran ini."
                  : "Penilaian AI belum aktif. Isi ANTHROPIC_API_KEY di file .env untuk mengaktifkannya."}
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex items-start gap-4">
                  <div className={`rounded-lg px-3 py-2 text-center ring-1 ${scoreStyle(latest.score)}`}>
                    <p className="text-2xl font-semibold tabular-nums">{latest.score}</p>
                    <p className="text-[11px]">dari 100</p>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-700">{latest.summary}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">Kekuatan</h3>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {(latest.strengths as string[]).map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">Kekurangan</h3>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {(latest.gaps as string[]).length === 0 ? (
                        <li className="list-none text-slate-500">Tidak ada yang menonjol.</li>
                      ) : (
                        (latest.gaps as string[]).map((g) => <li key={g}>{g}</li>)
                      )}
                    </ul>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Dinilai {formatDate(latest.createdAt)} oleh {latest.aiModel}. Skor AI adalah bahan pertimbangan, bukan
                  keputusan.
                </p>

                <div className="border-t border-slate-100 pt-4">
                  {latest.reviewedAt && latest.decision && (
                    <p className="mb-3 text-sm text-slate-700">
                      Ditinjau oleh <strong>{latest.reviewedBy?.name}</strong> ({formatDate(latest.reviewedAt)}):{" "}
                      <strong>{decisionLabel[latest.decision]}</strong>
                    </p>
                  )}
                  {canManage && (
                    <ReviewForm screeningId={latest.id} decision={latest.decision} decisionNote={latest.decisionNote} />
                  )}
                </div>

                {older.length > 0 && (
                  <details className="text-sm text-slate-600">
                    <summary className="cursor-pointer">Penilaian sebelumnya ({older.length})</summary>
                    <ul className="mt-2 space-y-1">
                      {older.map((s) => (
                        <li key={s.id}>
                          {formatDate(s.createdAt)}: skor {s.score}
                          {s.decision ? ` · ${decisionLabel[s.decision]}` : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-medium text-slate-900">Wawancara</h2>

            <details className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-slate-800">
                Panduan wawancara {jobKit?.success ? `(${jobKit.data.questions.length} pertanyaan)` : ""}
              </summary>
              {jobKit?.success ? (
                <div className="mt-3 space-y-3">
                  {jobKit.data.notes && <p className="text-slate-600">{jobKit.data.notes}</p>}
                  <ol className="list-decimal space-y-3 pl-5">
                    {jobKit.data.questions.map((q, i) => (
                      <li key={i}>
                        <p className="font-medium text-slate-900">{q.question}</p>
                        <p className="text-xs text-slate-500">
                          {q.competency} · {q.type}
                        </p>
                        {q.lookFor.length > 0 && (
                          <p className="mt-1 text-slate-700">Cari: {q.lookFor.join("; ")}</p>
                        )}
                        <div className="mt-1 grid gap-1 text-xs text-slate-600 sm:grid-cols-3">
                          <p>
                            <strong>1</strong> · {q.rubric.kurang}
                          </p>
                          <p>
                            <strong>3</strong> · {q.rubric.cukup}
                          </p>
                          <p>
                            <strong>5</strong> · {q.rubric.baik}
                          </p>
                        </div>
                        {q.followUps.length > 0 && <p className="mt-1 text-xs text-slate-500">Pendalaman: {q.followUps.join(" / ")}</p>}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : (
                <p className="mt-2 text-slate-600">
                  Belum ada panduan yang disetujui untuk lowongan ini.
                  {(isHr || canManage) && (
                    <>
                      {" "}
                      <Link href={`/dashboard/lowongan/${app.job.id}/wawancara`} className="text-teal-700 underline">
                        Susun panduan
                      </Link>
                    </>
                  )}
                </p>
              )}

              <div className="mt-4 border-t border-slate-200 pt-3">
                <p className="font-medium text-slate-800">Pertanyaan khusus kandidat ini</p>
                {candidateQs?.success ? (
                  <ul className="mt-2 space-y-2">
                    {candidateQs.data.questions.map((q, i) => (
                      <li key={i}>
                        <p className="text-slate-900">{q.question}</p>
                        <p className="text-xs text-slate-500">Alasan: {q.reason}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    Dibuat AI dari hasil seleksi CV (tanpa mengirim ulang CV){!isAiConfigured() && "; AI belum aktif"}
                    {isAiConfigured() && !latest && "; perlu penilaian AI terlebih dahulu"}.
                  </p>
                )}
                {canGenerateQuestions && (
                  <div className="mt-2">
                    <GenerateQuestionsButton applicationId={app.id} hasQuestions={Boolean(candidateQs?.success)} />
                  </div>
                )}
              </div>
            </details>

            {app.interviews.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">Belum ada wawancara.</p>
            ) : (
              <ul className="mt-3 space-y-4">
                {app.interviews.map((iv) => {
                  const canGiveFeedback = iv.interviewerId === user.id || isHr;
                  return (
                    <li key={iv.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{formatDateTime(iv.scheduledAt)}</p>
                          <p className="text-sm text-slate-600">
                            {iv.durationMin} menit · {interviewModeLabel[iv.mode]} · dengan {iv.interviewer.name}
                          </p>
                          {iv.locationOrLink &&
                            (/^https?:\/\//.test(iv.locationOrLink) ? (
                              <a
                                href={iv.locationOrLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="break-all text-sm text-teal-700 hover:underline"
                              >
                                {iv.locationOrLink}
                              </a>
                            ) : (
                              <p className="text-sm text-slate-600">{iv.locationOrLink}</p>
                            ))}
                        </div>
                        {canManage && iv.rating === null && <CancelInterviewButton interviewId={iv.id} />}
                      </div>

                      {iv.rating !== null ? (
                        <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                          <p>
                            Nilai <strong>{iv.rating}/5</strong>
                            {iv.recommendation && (
                              <>
                                {" "}
                                · rekomendasi <strong>{decisionLabel[iv.recommendation]}</strong>
                              </>
                            )}
                          </p>
                          {iv.feedback && <p className="mt-1 whitespace-pre-line">{iv.feedback}</p>}
                        </div>
                      ) : (
                        canGiveFeedback &&
                        isFeedbackOpen(iv.scheduledAt) && (
                          <div className="mt-3 border-t border-slate-100 pt-3">
                            <FeedbackForm interviewId={iv.id} />
                          </div>
                        )
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {canSchedule && (
              <details className="mt-4" open={app.interviews.length === 0}>
                <summary className="cursor-pointer text-sm font-medium text-teal-800">Jadwalkan wawancara</summary>
                <div className="mt-3">
                  <ScheduleInterviewForm applicationId={app.id} interviewers={interviewers} defaultInterviewerId={user.id} />
                </div>
              </details>
            )}
          </section>

          {profile && (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-medium text-slate-900">Ringkasan CV</h2>
              <dl className="mt-3 divide-y divide-slate-100">
                <Row label="Pendidikan">{profile.highestEducation ?? "-"}</Row>
                <Row label="Total pengalaman">
                  {profile.totalExperienceYears !== null ? `${profile.totalExperienceYears} tahun` : "-"}
                </Row>
                <Row label="Keahlian">{profile.skills.length ? profile.skills.join(", ") : "-"}</Row>
              </dl>
              {profile.recentRoles.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-slate-700">
                  {profile.recentRoles.map((r, i) => (
                    <li key={i}>
                      <span className="font-medium">{r.title}</span>
                      {r.company && ` · ${r.company}`}
                      {r.period && <span className="text-slate-500"> ({r.period})</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <div className="space-y-6">
          {app.employee && (
            <section className="rounded-xl border border-teal-200 bg-teal-50 p-5 text-sm text-teal-900">
              Sudah menjadi karyawan (No. {app.employee.employeeNumber}).{" "}
              {isHr && (
                <Link href="/dashboard/karyawan" className="font-medium underline">
                  Lihat daftar karyawan
                </Link>
              )}
            </section>
          )}

          {(showOfferForm || (isHr && app.letters.length > 0)) && (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-medium text-slate-900">Surat penawaran</h2>
              {app.letters.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {app.letters.map((l) => (
                    <li key={l.id} className="flex justify-between gap-2">
                      <span className="text-slate-700">
                        {l.letterNumber} · {formatDate(l.issuedAt)}
                      </span>
                      <a href={`/dashboard/surat/${l.id}/pdf`} target="_blank" className="text-teal-700 hover:underline">
                        PDF
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {showOfferForm && offerTemplate && offerVars && (
                <details className="mt-3" open={app.letters.length === 0}>
                  <summary className="cursor-pointer text-sm font-medium text-teal-800">Buat surat penawaran</summary>
                  <div className="mt-3">
                    <OfferLetterForm
                      applicationId={app.id}
                      template={{ name: offerTemplate.name, body: offerTemplate.body }}
                      vars={Object.fromEntries(Object.entries(offerVars).filter(([k]) => k !== "_name"))}
                      defaults={{ location: offerVars.lokasi, employmentType: app.job.employmentType }}
                    />
                  </div>
                </details>
              )}
            </section>
          )}

          {showHireForm && (
            <section className="rounded-xl border border-teal-200 bg-white p-5">
              <h2 className="font-medium text-slate-900">Buat data karyawan</h2>
              <p className="mt-1 text-sm text-slate-600">
                Kandidat sudah diterima. Isi data berikut untuk membuat data karyawan dan kontrak pertamanya.
              </p>
              <div className="mt-3">
                <HireForm
                  applicationId={app.id}
                  departments={departments}
                  defaults={{ departmentId: app.job.departmentId, position: app.job.title, employmentType: app.job.employmentType }}
                />
              </div>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-medium text-slate-900">Tahap rekrutmen</h2>
            <p className="mt-1 text-xs text-slate-500">Diubah terakhir {formatDate(app.stageChangedAt)}</p>
            {app.stage === "REJECTED" && app.rejectionReason && (
              <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">Alasan: {app.rejectionReason}</p>
            )}
            {canManage && !app.employee && (
              <div className="mt-3">
                <StageForm applicationId={app.id} stage={app.stage} />
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-medium text-slate-900">Data pelamar</h2>
            <dl className="mt-2 divide-y divide-slate-100">
              <Row label="Email">
                <a href={`mailto:${candidate.email}`} className="text-teal-700 hover:underline">
                  {candidate.email}
                </a>
              </Row>
              <Row label="Telepon">{candidate.phone}</Row>
              <Row label="Kota">{candidate.city ?? "-"}</Row>
              <Row label="Pendidikan">{candidate.lastEducation ?? "-"}</Row>
              <Row label="Gaji diharapkan">{app.expectedSalary !== null ? formatRupiah(app.expectedSalary) : "-"}</Row>
              <Row label="Mulai bekerja">{app.noticePeriodDays !== null ? `${app.noticePeriodDays} hari` : "-"}</Row>
              <Row label="Sumber">
                {app.source ? (applicationSources[app.source as keyof typeof applicationSources] ?? app.source) : "-"}
              </Row>
            </dl>
            {resume && (
              <a
                href={`/dashboard/kandidat/${app.id}/cv`}
                className="mt-4 flex items-center justify-between rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <span className="truncate">Unduh CV · {resume.fileName}</span>
                <span className="shrink-0 text-xs text-slate-500">{Math.max(1, Math.round(resume.sizeBytes / 1024))} KB</span>
              </a>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            <h2 className="font-medium text-slate-900">Persetujuan data (UU PDP)</h2>
            <p className="mt-2">
              Disetujui {formatDate(candidate.consentAt)} (versi {candidate.consentVersion}).
              {candidate.talentPoolConsent ? " Bersedia masuk talent pool." : ""}
            </p>
            <p className="mt-1">Data dihapus otomatis setelah {formatDate(candidate.retainUntil)}.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
