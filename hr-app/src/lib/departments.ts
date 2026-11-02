import "server-only";
import { db } from "@/lib/db";

type Client = Pick<typeof db, "department">;

// Departments are typed freely on forms and imports: reuse one with the same
// name (ignoring case, so "it" finds "IT"), otherwise create it.
export async function findOrCreateDepartment(name: string, client: Client = db) {
  const existing = await client.department.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  return (
    existing ??
    client.department.upsert({ where: { name }, update: {}, create: { name }, select: { id: true } })
  );
}
