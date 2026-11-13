import "server-only";
import { siteDb } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";
import { equalsIgnoringCase } from "@/lib/match";

type Client = Pick<PrismaClient, "department">;

// Departments are typed freely on forms and imports: reuse one with the same
// name (ignoring case, so "it" finds "IT"), otherwise create it.
export async function findOrCreateDepartment(name: string, given?: Client) {
  const client = given ?? (await siteDb());
  const existing = await client.department.findFirst({
    where: { name: equalsIgnoringCase(name) },
    select: { id: true },
  });
  return (
    existing ??
    client.department.upsert({ where: { name }, update: {}, create: { name }, select: { id: true } })
  );
}
