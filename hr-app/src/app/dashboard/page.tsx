import type { Metadata } from "next";
import Link from "next/link";
import { currentSite, siteDb } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { markNotificationsRead } from "@/app/actions/bank";
import { formatDate, formatDateTime, interviewModeLabel, todayDate } from "@/lib/labels";
import { contractAlert, endingContractsWhere } from "@/lib/contracts";
import { AlertIcon, ContractAlertBadge } from "@/app/ui/contract-alert";
import { TrainingBadge } from "@/app/ui/training-badge";
import { graduatedNumber } from "@/lib/training";

const TRAINING_ALERT_DAYS = 7;

// Interview date tile: "12" over "Nov", in WIB like every date in the app
const tileDay = new Intl.DateTimeFormat("id-ID", { day: "numeric", timeZone: "Asia/Jakarta" });
const tileMonth = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "Asia/Jakarta" });
// Page subtitle: "Senin, 16 November 2026"
const longDate = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });

export const metadata: Metadata = { title: "Ringkasan" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

const DAY = 24 * 60 * 60 * 1000;

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const db = await siteDb();
  const user = await requireUser();
  const site = await currentSite();
  const { akses, sandi } = await searchParams;

  const isHr = user.role === "ADMIN" || user.role === "HR";
  const canSeeRecruitment = user.role !== "EMPLOYEE";
  const jobFilter = user.role === "HIRING_MANAGER" ? { hiringManagerId: user.id } : {};
  const activeCandidate = { anonymizedAt: null };
  const now = new Date();

  const [openJobs, newApplications, inInterview, pendingBankRequests] = canSeeRecruitment
    ? await Promise.all([
        db.job.count({ where: { ...jobFilter, status: "OPEN" } }),
        db.application.count({ where: { job: jobFilter, stage: "APPLIED", candidate: activeCandidate } }),
        db.application.count({ where: { job: jobFilter, stage: "INTERVIEW", candidate: activeCandidate } }),
        isHr ? db.bankChangeRequest.count({ where: { status: "PENDING_APPROVAL" } }) : 0,
      ])
    : [0, 0, 0, 0];

  // HR sees every interview; everyone else sees the ones they conduct
  const interviewScope = isHr ? {} : { interviewerId: user.id };
  const [upcoming, needFeedback, endingContracts] = await Promise.all([
    db.interview.findMany({
      where: { ...interviewScope, status: "SCHEDULED", scheduledAt: { gte: now, lte: new Date(now.getTime() + 14 * DAY) } },
      orderBy: { scheduledAt: "asc" },
      take: 10,
      select: {
        id: true,
        scheduledAt: true,
        mode: true,
        applicationId: true,
        interviewer: { select: { name: true } },
        application: { select: { candidate: { select: { fullName: true } }, job: { select: { title: true } } } },
      },
    }),
    db.interview.findMany({
      where: { interviewerId: user.id, status: "SCHEDULED", rating: null, scheduledAt: { lt: now } },
      orderBy: { scheduledAt: "desc" },
      select: {
        id: true,
        scheduledAt: true,
        applicationId: true,
        application: { select: { candidate: { select: { fullName: true } } } },
      },
    }),
    isHr
      ? db.employee.findMany({
          where: endingContractsWhere(),
          orderBy: { endDate: "asc" },
          select: { id: true, fullName: true, position: true, endDate: true, status: true },
        })
      : [],
  ]);

  // Trainees whose training ends within a week: the T is dropped the day after (src/lib/training-job.ts)
  const trainingEnding = isHr
    ? (
        await db.employee.findMany({
          where: {
            anonymizedAt: null,
            traineeNumber: null,
            employeeNumber: { startsWith: "T" },
            // Past ones are either renamed already or blocked by a clash (that one gets a notification)
            trainingEnd: { gte: todayDate(), lte: new Date(todayDate().getTime() + TRAINING_ALERT_DAYS * DAY) },
          },
          orderBy: { trainingEnd: "asc" },
          select: { id: true, fullName: true, position: true, employeeNumber: true, trainingEnd: true },
        })
      ).filter((e) => graduatedNumber(e.employeeNumber))
    : [];

  const notifications = await db.notification.findMany({
    where: { userId: user.id, readAt: null },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, title: true, body: true, link: true, createdAt: true },
  });

  const stats: { label: string; value: number }[] = [
    { label: "Lowongan dibuka", value: openJobs },
    { label: "Lamaran baru", value: newApplications },
    { label: "Tahap wawancara", value: inInterview },
    ...(isHr ? [{ label: "Perubahan rekening menunggu", value: pendingBankRequests }] : []),
  ];

  return (
    <div className="space-y-6">
      {akses === "ditolak" && (
        <p role="alert" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Anda tidak memiliki akses ke halaman tersebut.
        </p>
      )}
      {sandi === "diubah" && (
        <p role="status" className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800">
          Kata sandi berhasil diganti.
        </p>
      )}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Ringkasan</h1>
        <p className="mt-1 text-sm text-slate-500">
          {longDate.format(now)} · {site.label}
        </p>
      </div>

      {notifications.length > 0 && (
        <section className="card p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-medium text-slate-900">
              Notifikasi <span className="ml-1 text-sm font-normal tabular-nums text-slate-500">{notifications.length}</span>
            </h2>
            <form action={markNotificationsRead}>
              <button type="submit" className="text-sm text-brand-800 hover:underline">
                Tandai sudah dibaca
              </button>
            </form>
          </div>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {notifications.map((n) => (
              <li key={n.id} className="flex gap-3 py-3">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-600" />
                <div className="min-w-0">
                  {n.link ? (
                    <Link href={n.link} className="font-medium text-brand-800 hover:underline">
                      {n.title}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-900">{n.title}</span>
                  )}
                  <p className="text-slate-600">{n.body}</p>
                  <p className="mt-1 text-xs tabular-nums text-slate-500">{formatDateTime(n.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {user.role === "EMPLOYEE" && (
        <section className="grid gap-4 sm:grid-cols-2">
          <Link href="/dashboard/rekening" className="card p-5 transition-colors hover:border-brand-600">
            <p className="font-medium text-slate-900">Rekening gaji</p>
            <p className="mt-1 text-sm text-slate-600">Lihat atau ajukan perubahan rekening untuk penggajian</p>
          </Link>
          <Link href="/dashboard/akun" className="card p-5 transition-colors hover:border-brand-600">
            <p className="font-medium text-slate-900">Akun saya</p>
            <p className="mt-1 text-sm text-slate-600">Ganti kata sandi</p>
          </Link>
        </section>
      )}

      {canSeeRecruitment && (
        <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 sm:gap-4 lg:grid-cols-[repeat(4,minmax(0,1fr))]">
          {stats.map((s) => (
            <div key={s.label} className="card flex flex-col justify-between gap-3 p-4 sm:p-5">
              <p className="text-sm text-slate-500">{s.label}</p>
              <p className="text-2xl font-semibold leading-none tabular-nums text-slate-900 sm:text-3xl">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {needFeedback.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-medium text-amber-900">Menunggu penilaian Anda</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {needFeedback.map((iv) => (
              <li key={iv.id}>
                <Link href={`/dashboard/kandidat/${iv.applicationId}`} className="text-amber-900 underline">
                  {iv.application.candidate.fullName}
                </Link>{" "}
                <span className="text-amber-800">· diwawancarai {formatDateTime(iv.scheduledAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-medium text-slate-900">Wawancara 14 hari ke depan</h2>
          {upcoming.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">Tidak ada jadwal wawancara.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {upcoming.map((iv) => (
                <li key={iv.id} className="flex items-center gap-3 py-3 text-sm">
                  <span className="w-12 shrink-0 rounded-lg bg-brand-50 py-1 text-center text-brand-800 ring-1 ring-brand-100">
                    <span className="block text-lg font-semibold leading-tight tabular-nums">{tileDay.format(iv.scheduledAt)}</span>
                    <span className="block text-xs">{tileMonth.format(iv.scheduledAt)}</span>
                  </span>
                  <div className="min-w-0">
                    <Link href={`/dashboard/kandidat/${iv.applicationId}`} className="font-medium text-brand-800 hover:underline">
                      {iv.application.candidate.fullName}
                    </Link>
                    <span className="text-slate-600"> · {iv.application.job.title}</span>
                    <p className="text-slate-500">
                      {formatDateTime(iv.scheduledAt)} · {interviewModeLabel[iv.mode]}
                      {isHr && ` · ${iv.interviewer.name}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {isHr && (
          <section className="card p-5">
            <h2 className="flex items-center gap-2 font-medium text-slate-900">
              {endingContracts.length > 0 && <AlertIcon className="size-4 text-amber-600" />}
              Kontrak berakhir ≤ 6 minggu
            </h2>
            {endingContracts.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">Tidak ada kontrak yang berakhir dalam 6 minggu.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {endingContracts.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div>
                      <Link href={`/dashboard/karyawan/${e.id}`} className="font-medium text-brand-800 hover:underline">
                        {e.fullName}
                      </Link>
                      <span className="text-slate-600"> · {e.position}</span>
                      <p className="text-xs text-slate-500">Berakhir {formatDate(e.endDate!)}</p>
                    </div>
                    <ContractAlertBadge {...contractAlert(e.endDate, e.status)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {trainingEnding.length > 0 && (
        <section className="card p-5">
          <h2 className="font-medium text-slate-900">Training selesai ≤ {TRAINING_ALERT_DAYS} hari</h2>
          <p className="mt-1 text-sm text-slate-500">Sehari setelah tanggal selesai, huruf T di Employee ID dibuang otomatis. Penanda untuk payroll.</p>
          <ul className="mt-3 divide-y divide-slate-100">
            {trainingEnding.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <Link href={`/dashboard/karyawan/${e.id}`} className="font-medium text-brand-800 hover:underline">
                    {e.fullName}
                  </Link>
                  <span className="text-slate-600"> · {e.position}</span>
                  <p className="text-xs text-slate-500">
                    {e.employeeNumber} → {graduatedNumber(e.employeeNumber)}
                  </p>
                </div>
                <TrainingBadge end={e.trainingEnd!} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
