import "server-only";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/accounts/client";
import { mariadbConfig } from "./db-config";

// The accounts database (portal_hr_akun): passwords and per-location access.
// One client, reused across hot reloads in development.
const globalForAccounts = globalThis as unknown as { accountsDb?: PrismaClient };

export const accountsDb =
  globalForAccounts.accountsDb ?? new PrismaClient({ adapter: new PrismaMariaDb(mariadbConfig(process.env.ACCOUNTS_DATABASE_URL)) });

if (process.env.NODE_ENV !== "production") globalForAccounts.accountsDb = accountsDb;
