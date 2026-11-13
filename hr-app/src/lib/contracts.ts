import "server-only";
import { siteDb } from "@/lib/db";
import { daysUntil, todayDate } from "@/lib/labels";

// Contracts ending within 6 weeks get an alert: in the menu, the dashboard,
// the employee list and the employee page. Past end dates stay flagged until
// HR changes the employee's status (e.g. to "Kontrak berakhir" or renews).
export const CONTRACT_ALERT_DAYS = 42;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ContractAlert = "overdue" | "soon" | null;

export function contractAlert(endDate: Date | null, status: string): { level: ContractAlert; daysLeft: number | null } {
  if (!endDate || (status !== "ACTIVE" && status !== "PROBATION")) return { level: null, daysLeft: null };
  const daysLeft = daysUntil(endDate);
  if (daysLeft < 0) return { level: "overdue", daysLeft };
  if (daysLeft <= CONTRACT_ALERT_DAYS) return { level: "soon", daysLeft };
  return { level: null, daysLeft };
}

// Prisma filter for working employees whose contract ends within the alert window (or already ended)
export function endingContractsWhere() {
  return {
    status: { in: ["ACTIVE" as const, "PROBATION" as const] },
    endDate: { not: null, lte: new Date(todayDate().getTime() + CONTRACT_ALERT_DAYS * DAY_MS) },
  };
}

export const countEndingContracts = async () => (await siteDb()).employee.count({ where: endingContractsWhere() });
