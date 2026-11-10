// Sorting the employee list by a column header (/dashboard/karyawan?urut=nama&arah=za).
// Pure functions, checked by scripts/check-employee-sort.mts.
import { employeeStatusLabel, employmentTypeLabel } from "@/lib/labels";
import type { EmployeeStatus, EmploymentType } from "@/generated/prisma/enums";

export const sortKeys = ["id", "nama", "departemen", "jenis", "status", "mulai", "berakhir"] as const;
export type SortKey = (typeof sortKeys)[number];
export type SortDir = "az" | "za";
export type Sort = { key: SortKey; dir: SortDir };

export type SortableEmployee = {
  employeeNumber: string;
  fullName: string;
  department: { name: string };
  employmentType: EmploymentType;
  status: EmployeeStatus;
  joinDate: Date;
  endDate: Date | null;
};

// Anything else in the URL means "no column chosen" (the page's default order)
export function parseSort(urut: unknown, arah: unknown): Sort | null {
  if (typeof urut !== "string" || !(sortKeys as readonly string[]).includes(urut)) return null;
  return { key: urut as SortKey, dir: arah === "za" ? "za" : "az" };
}

// Numeric-aware, so K-2 comes before K-10; case and accents ignored
const collator = new Intl.Collator("id", { numeric: true, sensitivity: "base" });

const text: Record<Exclude<SortKey, "mulai" | "berakhir">, (e: SortableEmployee) => string> = {
  id: (e) => e.employeeNumber,
  nama: (e) => e.fullName,
  departemen: (e) => e.department.name,
  jenis: (e) => employmentTypeLabel[e.employmentType],
  status: (e) => employeeStatusLabel[e.status],
};

function compare(a: SortableEmployee, b: SortableEmployee, key: SortKey): number {
  if (key === "mulai") return a.joinDate.getTime() - b.joinDate.getTime();
  if (key === "berakhir") return a.endDate!.getTime() - b.endDate!.getTime();
  return collator.compare(text[key](a), text[key](b));
}

// Returns a new array. Ties fall back to the name (A-Z). Without a contract end date
// (permanent staff) a row always sorts last, whichever way the column is sorted.
export function sortEmployees<T extends SortableEmployee>(rows: readonly T[], { key, dir }: Sort): T[] {
  const sign = dir === "az" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "berakhir" && (!a.endDate || !b.endDate)) {
      if (a.endDate || b.endDate) return a.endDate ? -1 : 1;
    } else {
      const c = compare(a, b, key);
      if (c) return sign * c;
    }
    return collator.compare(a.fullName, b.fullName);
  });
}

// What clicking a header does: the active column flips direction, another column starts at A-Z
export const nextSort = (current: Sort | null, key: SortKey): Sort =>
  current?.key === key ? { key, dir: current.dir === "az" ? "za" : "az" } : { key, dir: "az" };
