import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateJob } from "@/app/actions/jobs";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { JobForm } from "../../job-form";
import { getJobFormOptions } from "../../form-options";

export const metadata: Metadata = { title: "Ubah lowongan" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

const str = (n: number | null) => (n === null ? "" : String(n));

export default async function EditJobPage({ params }: PageProps<"/dashboard/lowongan/[id]/ubah">) {
  await requireRole("ADMIN", "HR");
  const { id } = await params;

  const [job, { departments, managers }] = await Promise.all([
    db.job.findUnique({ where: { id } }),
    getJobFormOptions(),
  ]);
  if (!job) notFound();

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Ubah lowongan</h1>
      <JobForm
        action={updateJob.bind(null, job.id)}
        departments={departments}
        managers={managers}
        submitLabel="Simpan perubahan"
        initial={{
          title: job.title,
          departmentId: job.departmentId,
          hiringManagerId: job.hiringManagerId,
          employmentType: job.employmentType,
          location: job.location,
          description: job.description,
          requirements: job.requirements,
          minEducation: job.minEducation ?? "",
          minExperienceYears: str(job.minExperienceYears),
          salaryMin: str(job.salaryMin),
          salaryMax: str(job.salaryMax),
          showSalary: job.showSalary,
          headcount: String(job.headcount),
          status: job.status,
        }}
      />
    </div>
  );
}
