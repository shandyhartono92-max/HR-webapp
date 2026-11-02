import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
    // Only for `prisma migrate dev`: an empty database it may wipe (portal_hr_shadow),
    // since the app's MariaDB user cannot create databases
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
