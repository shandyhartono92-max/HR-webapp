// Applies the location migrations (prisma/migrations) to every location database, so
// they never drift apart:  npm run db:migrate:sites
// Guard: the migration that drops the password columns from `user` is refused while a
// user in that location has no account in the accounts database (scripts/split-accounts.mts
// copies them first), so no password can be lost.
import { execSync } from "node:child_process";
import { dbFor } from "@/lib/db";
import { accountsDb } from "@/lib/accounts-db";
import { sites } from "@/lib/sites";
import { mirrorMigrationGuard } from "@/lib/migration-guard";

let failed = false;
const knownAccounts = async (ids: string[]) =>
  (await accountsDb.account.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((a) => a.id);

for (const site of sites()) {
  const guard = await mirrorMigrationGuard(dbFor(site.code), knownAccounts);
  if (!guard.ok && "missing" in guard) {
    console.error(`[${site.label}] DITOLAK: ${guard.missing.length} pengguna belum punya akun di database akun (${guard.missing.join(", ")}).`);
    console.error(`Jalankan dulu: npx tsx --conditions=react-server --env-file=.env scripts/split-accounts.mts ${site.code}`);
    failed = true;
    continue;
  }
  if (!guard.ok) {
    // Could not check: never assume the passwords are safe
    console.error(`[${site.label}] DITOLAK: pengecekan sebelum migrasi gagal (${guard.error}). Tidak ada yang diubah.`);
    failed = true;
    continue;
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
