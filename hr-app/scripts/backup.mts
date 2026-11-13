// Backs up the accounts database and every location database together:
//   npm run backup
// Each goes to <BACKUP_DIR>/<YYYY-MM-DD-HHmm>/<database>.sql (see src/lib/backup-plan.ts).
// Credentials go to mysqldump through a temporary file that is deleted afterwards, so
// they never appear in the process list. Set MYSQLDUMP if it is not XAMPP's.
import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { backupPlan } from "@/lib/backup-plan";

const MYSQLDUMP = process.env.MYSQLDUMP ?? "C:\\xampp\\mysql\\bin\\mysqldump.exe";
const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
const plan = backupPlan(process.env, new Date(), repoRoot);
if (!plan.ok) {
  console.error(plan.error);
  process.exit(1);
}

mkdirSync(plan.dir, { recursive: true });
let failed = false;
for (const t of plan.targets) {
  const u = new URL(t.url);
  const cnf = path.join(tmpdir(), `portal-hr-backup-${process.pid}.cnf`);
  const out = path.join(plan.dir, `${t.name}.sql`);
  writeFileSync(cnf, `[client]\nuser=${decodeURIComponent(u.username)}\npassword=${decodeURIComponent(u.password)}\nhost=${u.hostname}\nport=${u.port || 3306}\n`, { mode: 0o600 });
  try {
    execFileSync(MYSQLDUMP, [`--defaults-extra-file=${cnf}`, "--single-transaction", "--routines", `--result-file=${out}`, t.name], { stdio: ["ignore", "ignore", "inherit"] });
    const complete = readFileSync(out, "utf8").slice(-300).includes("Dump completed");
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
