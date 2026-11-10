import { formatDate } from "@/lib/labels";

// "Training s/d 30 Nov 2026" next to a trainee's name
export function TrainingBadge({ end }: { end: Date }) {
  return (
    <span
      title="Masih training: penanda untuk perhitungan payroll"
      className="inline-flex items-center whitespace-nowrap rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800"
    >
      Training s/d {formatDate(end)}
    </span>
  );
}
