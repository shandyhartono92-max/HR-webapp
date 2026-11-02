import type { ContractAlert } from "@/lib/contracts";

export function AlertIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// "Berakhir 12 hari lagi" / "Lewat 3 hari" pill for a contract end date
export function ContractAlertBadge({ level, daysLeft }: { level: ContractAlert; daysLeft: number | null }) {
  if (!level || daysLeft === null) return null;
  const overdue = level === "overdue";
  const text = overdue ? `Lewat ${-daysLeft} hari` : daysLeft === 0 ? "Berakhir hari ini" : `Berakhir ${daysLeft} hari lagi`;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
        overdue ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
      }`}
    >
      <AlertIcon />
      {text}
    </span>
  );
}
