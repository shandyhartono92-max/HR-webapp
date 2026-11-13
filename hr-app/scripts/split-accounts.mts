// One-off move: copy every user of a location database into the accounts database
// (portal_hr_akun) with access to that location. Safe to run again.
//   npx tsx --conditions=react-server --env-file=.env scripts/split-accounts.mts [site]   (default: batam)
import { dbFor } from "@/lib/db";
import { accountsDb } from "@/lib/accounts-db";
import { splitAccounts } from "@/lib/account-split";
import { siteByCode } from "@/lib/sites";

const site = siteByCode(process.argv[2] ?? "batam");
if (!site) {
  console.error(`Lokasi tidak dikenal: ${process.argv[2]}`);
  process.exit(1);
}

const from = dbFor(site.code);
const result = await splitAccounts(from, accountsDb, site.code);
const missing = (await from.user.findMany({ select: { id: true } })).length - (await accountsDb.account.count({ where: { access: { some: { site: site.code } } } }));
console.log(`[${site.label}] disalin: ${result.copied}, sudah ada: ${result.existing}, total pengguna: ${result.total}`);
console.log(missing === 0 ? "Semua pengguna punya akun dan akses." : `PERHATIAN: ${missing} pengguna belum punya akses.`);
await Promise.all([from.$disconnect(), accountsDb.$disconnect()]);
process.exit(missing === 0 ? 0 : 1);
