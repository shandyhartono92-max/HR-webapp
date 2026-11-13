import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { backupPlan, fileTail, optionFile } from "@/lib/backup-plan";

const env = {
  SITES: "batam,jakarta",
  DATABASE_URL_BATAM: "mysql://u:p@127.0.0.1:3306/portal_hr",
  DATABASE_URL_JAKARTA: "mysql://u:p@127.0.0.1:3306/portal_hr_jakarta",
  ACCOUNTS_DATABASE_URL: "mysql://u:p@127.0.0.1:3306/portal_hr_akun",
  BACKUP_DIR: "D:/Claude HR backups",
};
const now = new Date("2026-11-13T07:05:00Z"); // 14:05 WIB
const repo = "D:/Claude HR";

// All three databases, into one folder named after the local time
const plan = backupPlan(env, now, repo);
assert.equal(plan.ok, true, JSON.stringify(plan));
if (plan.ok) {
  assert.equal(plan.dir.replace(/\\/g, "/"), "D:/Claude HR backups/2026-11-13-1405");
  assert.deepEqual(plan.databases, ["portal_hr_akun", "portal_hr", "portal_hr_jakarta"]);
  assert.equal(plan.targets[0].url, env.ACCOUNTS_DATABASE_URL);
}

// The dumps hold personal data: never inside the repository, never without a folder
assert.deepEqual(backupPlan({ ...env, BACKUP_DIR: "" }, now, repo), { ok: false, error: "Isi BACKUP_DIR di .env (folder di luar repo)." });
assert.deepEqual(backupPlan({ ...env, BACKUP_DIR: "D:/Claude HR/hr-app/backups" }, now, repo), {
  ok: false,
  error: "BACKUP_DIR tidak boleh di dalam folder repo: isinya data pribadi.",
});
assert.equal(backupPlan({ ...env, ACCOUNTS_DATABASE_URL: "" }, now, repo).ok, false);

// The temporary option file quotes the password, so #, quotes and backslashes survive
assert.equal(
  optionFile("mysql://app:p%23a%22s%5Cs@127.0.0.1:3307/portal_hr"),
  '[client]\nuser="app"\npassword="p#a\\"s\\\\s"\nhost="127.0.0.1"\nport=3307\n',
);
assert.match(optionFile("mysql://app:pw@127.0.0.1/portal_hr"), /\nport=3306\n/);

// Only the end of a dump is read to see whether it completed
const tmp = path.join(os.tmpdir(), `check-backup-${process.pid}.sql`);
fs.writeFileSync(tmp, "x".repeat(5_000_000) + "\n-- Dump completed on 2026-11-13\n");
assert.equal(fileTail(tmp, 300).includes("Dump completed"), true);
fs.writeFileSync(tmp, "-- truncated");
assert.equal(fileTail(tmp, 300).includes("Dump completed"), false);
fs.rmSync(tmp);

console.log("check-backup: ok");
