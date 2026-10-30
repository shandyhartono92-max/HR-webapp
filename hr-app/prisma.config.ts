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
    // Only needed when the dev database cannot create a temporary one (e.g. `prisma dev`)
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
