import "server-only";
import { headers } from "next/headers";
import { siteDb } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type AuditInput = {
  actorId: string | null;
  action: string; // e.g. "auth.login", "employee.nik_viewed"
  entityType: string;
  entityId: string;
  // Only non-sensitive fields. Never pass decrypted NIK, account numbers or salary.
  changes?: Prisma.InputJsonValue;
};

export async function writeAudit({ actorId, action, entityType, entityId, changes }: AuditInput) {
  const db = await siteDb();
  const h = await headers();
  await db.auditLog.create({
    data: {
      actorId,
      action,
      entityType,
      entityId,
      changes,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent"),
    },
  });
}
