import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { employmentTypeLabel } from "@/lib/labels";
import { jobUrl, openJobsAllSites } from "@/lib/careers";
import { siteByCode, sites } from "@/lib/sites";

export const metadata: Metadata = { title: "Karir" };

// Open jobs of every location in one list, each labelled with its location
export default async function CareersPage({ searchParams }: PageProps<"/karir">) {
  await connection(); // render per request so new jobs show immediately
  const { lokasi } = await searchParams;
  const only = siteByCode(lokasi);
  const { jobs, unavailable } = await openJobsAllSites();
  const shown = only ? jobs.filter((j) => j.site === only.code) : jobs;
  const filters = [{ code: null, label: "Semua lokasi" }, ...sites().map((s) => ({ code: s.code, label: s.label }))];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <h1 className="text-3xl font-semibold text-slate-900">Bergabung bersama kami</h1>
      <p className="mt-2 text-slate-600">Lowongan yang sedang dibuka.</p>

      <nav aria-label="Filter lokasi" className="mt-6 flex flex-wrap gap-2 text-sm">
        {filters.map((f) => {
          const active = (only?.code ?? null) === f.code;
          return (
            <Link
              key={f.label}
              href={f.code ? `/karir?lokasi=${f.code}` : "/karir"}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3 py-1 ${
                active ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {unavailable.map((label) => (
        <p key={label} className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Lowongan {label} sedang tidak bisa ditampilkan. Silakan cek kembali nanti.
        </p>
      ))}

      {shown.length === 0 ? (
        <p className="mt-8 card p-6 text-slate-600">Saat ini belum ada lowongan. Silakan cek kembali nanti.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {shown.map((job) => (
            <li key={`${job.site}-${job.id}`}>
              <Link href={jobUrl(job.site, job.slug)} className="block card p-5 hover:border-brand-600">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-lg font-medium text-slate-900">{job.title}</p>
                  <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800">{job.siteLabel}</span>
                </div>
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
