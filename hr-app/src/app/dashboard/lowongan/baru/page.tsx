import type { Metadata } from "next";
import { createJob } from "@/app/actions/jobs";
import { requireRole } from "@/lib/dal";
import { JobForm } from "../job-form";
import { getJobFormOptions } from "../form-options";

export const metadata: Metadata = { title: "Tambah lowongan" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

export default async function NewJobPage() {
  const user = await requireRole("ADMIN", "HR");
  const { departments, managers } = await getJobFormOptions();

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Tambah lowongan</h1>
      <JobForm
        action={createJob}
        departments={departments}
        managers={managers}
        submitLabel="Simpan lowongan"
        initial={{
          title: "",
          departmentId: "",
          hiringManagerId: user.id,
          employmentType: "PKWT",
          location: "",
          description: "",
          requirements: "",
          minEducation: "",
          minExperienceYears: "",
          salaryMin: "",
          salaryMax: "",
          showSalary: false,
          headcount: "1",
          status: "DRAFT",
        }}
      />
    </div>
  );
}
