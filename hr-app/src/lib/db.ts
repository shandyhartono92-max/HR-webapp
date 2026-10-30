import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Reuse one client across hot reloads in development
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  // `prisma dev` (local dev database) only copes with one connection at a time;
  // set DATABASE_POOL_MAX=1 there. Leave it unset for a real PostgreSQL server.
  const max = Number(process.env.DATABASE_POOL_MAX) || undefined;
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
