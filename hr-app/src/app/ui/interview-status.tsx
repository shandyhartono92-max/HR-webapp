import { interviewStatusLabel } from "@/lib/labels";
import type { InterviewStatus } from "@/generated/prisma/enums";

const tone: Record<InterviewStatus, string> = {
  SCHEDULED: "bg-green-100 text-green-800",
  RESCHEDULED: "bg-amber-100 text-amber-800",
  NO_SHOW: "bg-red-100 text-red-800",
};

export function InterviewStatusPill({ status, children }: { status: InterviewStatus; children?: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${tone[status]}`}>
      {children ?? interviewStatusLabel[status]}
    </span>
  );
}
