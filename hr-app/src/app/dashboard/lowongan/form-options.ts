import "server-only";
import { db } from "@/lib/db";

// Name suggestions for the free-text department and hiring manager fields
export async function getJobFormOptions() {
  const [departments, managers, typedManagers] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    db.user.findMany({
      where: { isActive: true, role: { in: ["ADMIN", "HR", "HIRING_MANAGER"] } },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
    db.job.findMany({ distinct: ["hiringManagerName"], select: { hiringManagerName: true } }),
  ]);
  const managerNames = new Set([...managers.map((m) => m.name), ...typedManagers.map((j) => j.hiringManagerName)]);
  return {
    departments: departments.map((d) => d.name),
    managers: [...managerNames].sort((a, b) => a.localeCompare(b, "id")),
  };
}
