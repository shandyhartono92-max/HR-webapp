import "server-only";
import { db } from "@/lib/db";

export async function getJobFormOptions() {
  const [departments, managers] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({
      where: { isActive: true, role: { in: ["ADMIN", "HR", "HIRING_MANAGER"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return { departments, managers };
}
