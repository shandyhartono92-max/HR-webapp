import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { formatDate, pipelineStages, stageLabel } from "@/lib/labels";

export const metadata: Metadata = { title: "Kandidat" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

export default async function CandidatesPage({ searchParams }: PageProps<"/dashboard/kandidat">) {
  const user = await requireRole("ADMIN", "HR", "HIRING_MANAGER");
  const { lowongan } = await searchParams;
  const jobId = typeof lowongan === "string" ? lowongan : undefined;

  const applications = await db.application.findMany({
    where: {
      stage: { in: pipelineStages },
      candidate: { anonymizedAt: null },
      job: {
        ...(user.role === "HIRING_MANAGER" ? { hiringManagerId: user.id } : {}),
        ...(jobId ? { id: jobId } : {}),
      },
    },
    orderBy: { appliedAt: "desc" },
    select: {
      id: true,
      stage: true,
      appliedAt: true,
      candidate: { select: { fullName: true, lastEducation: true } },
      job: { select: { title: true } },
      // Latest AI score only
      screenings: { select: { score: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Kandidat</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {pipelineStages.map((stage) => {
          const items = applications.filter((a) => a.stage === stage);
          return (
            <section key={stage} className="rounded-xl border border-slate-200 bg-slate-100/60 p-3">
              <h2 className="flex items-center justify-between px-1 pb-2 text-sm font-medium text-slate-700">
                {stageLabel[stage]}
                <span className="tabular-nums text-slate-500">{items.length}</span>
              </h2>
              <ul className="space-y-2">
                {items.map((a) => {
                  const score = a.screenings[0]?.score;
                  return (
                    <li key={a.id} className="relative rounded-lg border border-slate-200 bg-white p-3 hover:border-teal-600">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/dashboard/kandidat/${a.id}`}
                          className="text-sm font-medium text-slate-900 after:absolute after:inset-0"
                        >
                          {a.candidate.fullName}
                        </Link>
                        {score !== undefined && (
                          <span
                            title="Skor kecocokan AI (perlu ditinjau HR)"
                            className="rounded bg-teal-50 px-1.5 py-0.5 text-xs font-medium tabular-nums text-teal-800"
                          >
                            {score}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{a.job.title}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {a.candidate.lastEducation ? `${a.candidate.lastEducation} · ` : ""}
                        {formatDate(a.appliedAt)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
