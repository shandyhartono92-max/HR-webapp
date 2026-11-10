import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { employmentTypeLabel, formatRupiah } from "@/lib/labels";
import { ApplyForm } from "./apply-form";

export const metadata: Metadata = { title: "Lowongan" };
export const instant = false; // job data is read per request so edits and closures show immediately

export default async function JobDetailPage({ params }: PageProps<"/karir/[slug]">) {
  const { slug } = await params;
  const job = await db.job.findFirst({
    where: { slug, status: "OPEN" },
    select: {
      id: true,
      title: true,
      location: true,
      employmentType: true,
      description: true,
      requirements: true,
      minEducation: true,
      minExperienceYears: true,
      salaryMin: true,
      salaryMax: true,
      showSalary: true,
      department: { select: { name: true } },
    },
  });
  if (!job) notFound();

  const salary =
    job.showSalary && (job.salaryMin || job.salaryMax)
      ? [job.salaryMin, job.salaryMax].filter((n): n is number => n !== null).map(formatRupiah).join(" – ")
      : null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-10">
      <div>
        <Link href="/karir" className="text-sm text-brand-700 hover:underline">
          ← Semua lowongan
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">{job.title}</h1>
        <p className="mt-2 text-slate-600">
          {job.department.name} · {job.location} · {employmentTypeLabel[job.employmentType]}
        </p>
        {salary && <p className="mt-1 text-sm font-medium text-slate-700">{salary} per bulan</p>}
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-slate-900">Deskripsi pekerjaan</h2>
        <p className="whitespace-pre-line text-slate-700">{job.description}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-slate-900">Kualifikasi</h2>
        <p className="whitespace-pre-line text-slate-700">{job.requirements}</p>
        {(job.minEducation || job.minExperienceYears !== null) && (
          <p className="text-sm text-slate-500">
            {job.minEducation && `Pendidikan minimal ${job.minEducation}`}
            {job.minEducation && job.minExperienceYears !== null && " · "}
            {job.minExperienceYears !== null && `Pengalaman minimal ${job.minExperienceYears} tahun`}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-medium text-slate-900">Lamar posisi ini</h2>
        <ApplyForm jobId={job.id} />
      </section>
    </main>
  );
}
