// Applies the location migrations (prisma/migrations) to every location database, so
// they never drift apart:  npm run db:migrate:sites
// Guard: the migration that drops the password columns from `user` is refused while a
// user in that location has no account in the accounts database (scripts/split-accounts.mts
// copies them first), so no password can be lost.
import { execSync } from "node:child_process";
import { dbFor } from "@/lib/db";
import { accountsDb } from "@/lib/accounts-db";
import { sites } from "@/lib/sites";

const MIRROR_MIGRATION = "20261113100000_user_mirror";
let failed = false;

for (const site of sites()) {
  const db = dbFor(site.code);
  const applied = await db
    .$queryRawUnsafe<{ n: bigint }[]>("SELECT COUNT(*) AS n FROM `_prisma_migrations` WHERE migration_name = ? AND finished_at IS NOT NULL", MIRROR_MIGRATION)
    .then((r) => Number(r[0].n) > 0)
    .catch(() => false); // a brand-new database has no migrations table yet

  if (!applied) {
    const users = await db.$queryRawUnsafe<{ id: string }[]>("SELECT id FROM `user`").catch(() => []);
    const known = new Set((await accountsDb.account.findMany({ where: { id: { in: users.map((u) => u.id) } }, select: { id: true } })).map((a) => a.id));
    const missing = users.filter((u) => !known.has(u.id)).map((u) => u.id);
    if (missing.length) {
      console.error(`[${site.label}] DITOLAK: ${missing.length} pengguna belum punya akun di database akun (${missing.join(", ")}).`);
      console.error(`Jalankan dulu: npx tsx --conditions=react-server --env-file=.env scripts/split-accounts.mts ${site.code}`);
      failed = true;
      continue;
    }
  }

  console.log(`[${site.label}] migrasi…`);
  try {
    execSync("npx prisma migrate deploy", { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, DATABASE_URL: site.databaseUrl } });
    console.log(`[${site.label}] selesai`);
  } catch {
    console.error(`[${site.label}] migrasi gagal`);
    failed = true;
  }
}

await Promise.all([...sites().map((s) => dbFor(s.code).$disconnect()), accountsDb.$disconnect()]);
process.exit(failed ? 1 : 0);
