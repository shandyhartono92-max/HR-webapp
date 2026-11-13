// Backs up the accounts database and every location database together:
//   npm run backup
// Each goes to <BACKUP_DIR>/<YYYY-MM-DD-HHmm>/<database>.sql (see src/lib/backup-plan.ts).
// Credentials go to mysqldump through a temporary file that is deleted afterwards, so
// they never appear in the process list. Set MYSQLDUMP if it is not XAMPP's.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { backupPlan, fileTail, optionFile } from "@/lib/backup-plan";

const MYSQLDUMP = process.env.MYSQLDUMP ?? "C:\\xampp\\mysql\\bin\\mysqldump.exe";
// The repository root, from this script's own location (git is not needed at run time)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const plan = backupPlan(process.env, new Date(), repoRoot);
if (!plan.ok) {
  console.error(plan.error);
  process.exit(1);
}

mkdirSync(plan.dir, { recursive: true });
let failed = false;
for (const t of plan.targets) {
  const cnf = path.join(tmpdir(), `portal-hr-backup-${process.pid}.cnf`);
  const out = path.join(plan.dir, `${t.name}.sql`);
  writeFileSync(cnf, optionFile(t.url), { mode: 0o600 });
  try {
    execFileSync(MYSQLDUMP, [`--defaults-extra-file=${cnf}`, "--single-transaction", "--routines", `--result-file=${out}`, t.name], { stdio: ["ignore", "ignore", "inherit"] });
    const complete = fileTail(out, 300).includes("Dump completed");
    console.log(`${t.name}: ${Math.round(statSync(out).size / 1024)} KB${complete ? "" : " (TIDAK LENGKAP)"}`);
    if (!complete) failed = true;
  } catch {
    console.error(`${t.name}: backup gagal`);
    failed = true;
  } finally {
    rmSync(cnf, { force: true });
  }
}
console.log(failed ? `Ada backup yang gagal. Folder: ${plan.dir}` : `Selesai: ${plan.dir}`);
process.exit(failed ? 1 : 0);
