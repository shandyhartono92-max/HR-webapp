import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { formatDate, pipelineStages, stageLabel } from "@/lib/labels";
import { InterviewStatusPill } from "@/app/ui/interview-status";
import type { InterviewStatus } from "@/generated/prisma/enums";

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
      // Most recently created first: [0] is the current interview (a moved slot can lie later in time)
      interviews: { select: { status: true, scheduledAt: true }, orderBy: { createdAt: "desc" } },
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
                    <li key={a.id} className="relative rounded-lg border border-slate-200 bg-white p-3 hover:border-brand-600">
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
                            className="rounded bg-brand-50 px-1.5 py-0.5 text-xs font-medium tabular-nums text-brand-800"
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
                      {stage === "INTERVIEW" && <InterviewBadges interviews={a.interviews} />}
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

// Status of the latest interview, plus how often the slot was moved
function InterviewBadges({ interviews }: { interviews: { status: InterviewStatus; scheduledAt: Date }[] }) {
  const latest = interviews[0];
  if (!latest) return null;
  const moved = interviews.filter((i) => i.status === "RESCHEDULED").length;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {latest.status === "SCHEDULED" ? (
        <InterviewStatusPill status="SCHEDULED">Terjadwal · {formatDate(latest.scheduledAt)}</InterviewStatusPill>
      ) : (
        <InterviewStatusPill status={latest.status} />
      )}
      {moved > 0 && <InterviewStatusPill status="RESCHEDULED">Reschedule {moved}×</InterviewStatusPill>}
    </div>
  );
}
