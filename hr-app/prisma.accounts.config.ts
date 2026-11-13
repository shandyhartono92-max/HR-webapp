import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// The accounts database (portal_hr_akun). Use with --config prisma.accounts.config.ts,
// e.g. npx prisma migrate deploy --config prisma.accounts.config.ts
export default defineConfig({
  schema: "prisma/accounts/schema.prisma",
  migrations: {
    path: "prisma/accounts/migrations",
  },
  datasource: {
    url: env("ACCOUNTS_DATABASE_URL"),
    // Only for `prisma migrate dev`: an empty database it may wipe (portal_hr_akun_shadow)
    shadowDatabaseUrl: process.env.ACCOUNTS_SHADOW_DATABASE_URL?.trim() || undefined,
  },
});
