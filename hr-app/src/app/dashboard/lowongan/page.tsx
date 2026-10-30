import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { employmentTypeLabel, formatDate, jobStatusLabel } from "@/lib/labels";

export const metadata: Metadata = { title: "Lowongan" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

const statusStyle = {
  DRAFT: "bg-slate-100 text-slate-700",
  OPEN: "bg-teal-50 text-teal-800",
  CLOSED: "bg-slate-200 text-slate-600",
} as const;

export default async function JobsPage() {
  const user = await requireRole("ADMIN", "HR", "HIRING_MANAGER");

  const jobs = await db.job.findMany({
    where: user.role === "HIRING_MANAGER" ? { hiringManagerId: user.id } : {},
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      employmentType: true,
      location: true,
      createdAt: true,
      department: { select: { name: true } },
      _count: { select: { applications: true } },
    },
  });

  const canEdit = user.role === "ADMIN" || user.role === "HR";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Lowongan</h1>
        {canEdit && (
          <Link
            href="/dashboard/lowongan/baru"
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
          >
            Tambah lowongan
          </Link>
        )}
      </div>

      {jobs.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Belum ada lowongan.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Posisi</th>
                <th className="px-4 py-3 font-medium">Departemen</th>
                <th className="px-4 py-3 font-medium">Jenis</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Pelamar</th>
                <th className="px-4 py-3 font-medium">Dibuat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="px-4 py-3">
                    {canEdit ? (
                      <Link href={`/dashboard/lowongan/${job.id}/ubah`} className="font-medium text-teal-800 hover:underline">
                        {job.title}
                      </Link>
                    ) : (
                      <p className="font-medium text-slate-900">{job.title}</p>
                    )}
                    <p className="text-xs text-slate-500">
                      <Link href={`/dashboard/lowongan/${job.id}/wawancara`} className="text-teal-700 hover:underline">
                        Panduan wawancara
                      </Link>
                      {" · "}
                      {job.location}
                      {job.status === "OPEN" && (
                        <>
                          {" · "}
                          <Link href={`/karir/${job.slug}`} target="_blank" className="text-teal-700 hover:underline">
                            Lihat di karir
                          </Link>
                        </>
                      )}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{job.department.name}</td>
                  <td className="px-4 py-3 text-slate-700">{employmentTypeLabel[job.employmentType]}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[job.status]}`}>
                      {jobStatusLabel[job.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <Link href={`/dashboard/kandidat?lowongan=${job.id}`} className="text-teal-700 hover:underline">
                      {job._count.applications}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(job.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
