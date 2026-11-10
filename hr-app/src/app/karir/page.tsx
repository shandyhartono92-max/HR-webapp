import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { employmentTypeLabel } from "@/lib/labels";

export const metadata: Metadata = { title: "Karir" };

export default async function CareersPage() {
  await connection(); // render per request so new jobs show immediately
  const jobs = await db.job.findMany({
    where: { status: "OPEN" },
    orderBy: { openedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      location: true,
      employmentType: true,
      department: { select: { name: true } },
    },
  });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <h1 className="text-3xl font-semibold text-slate-900">Bergabung bersama kami</h1>
      <p className="mt-2 text-slate-600">Lowongan yang sedang dibuka.</p>

      {jobs.length === 0 ? (
        <p className="mt-8 card p-6 text-slate-600">
          Saat ini belum ada lowongan. Silakan cek kembali nanti.
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link
                href={`/karir/${job.slug}`}
                className="block card p-5 hover:border-brand-600"
              >
                <p className="text-lg font-medium text-slate-900">{job.title}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {job.department.name} · {job.location} · {employmentTypeLabel[job.employmentType]}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
