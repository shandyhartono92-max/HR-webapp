import path from "node:path";
import { parseSites } from "@/lib/sites";

// What scripts/backup.mts dumps and where: the accounts database and every location
// database, together, into <BACKUP_DIR>/<YYYY-MM-DD-HHmm> (Indonesian western time).
// The dumps hold personal data, so the folder must be outside the repository.
// Pure; checked by scripts/check-backup.mts.

type Env = Record<string, string | undefined>;
export type BackupPlan =
  | { ok: true; dir: string; databases: string[]; targets: { name: string; url: string }[] }
  | { ok: false; error: string };

const stamp = (now: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}-${p.hour}${p.minute}`;
};

export function backupPlan(env: Env, now: Date, repoRoot: string): BackupPlan {
  const base = env.BACKUP_DIR?.trim();
  if (!base) return { ok: false, error: "Isi BACKUP_DIR di .env (folder di luar repo)." };
  const inside = path.relative(path.resolve(repoRoot), path.resolve(base));
  if (!inside.startsWith("..") && !path.isAbsolute(inside)) {
    return { ok: false, error: "BACKUP_DIR tidak boleh di dalam folder repo: isinya data pribadi." };
  }

  const accounts = env.ACCOUNTS_DATABASE_URL?.trim();
  if (!accounts) return { ok: false, error: "ACCOUNTS_DATABASE_URL belum diisi." };
  const sites = parseSites(env);
  if (!sites.ok) return { ok: false, error: `Konfigurasi lokasi belum lengkap: ${sites.missing.join(", ")}` };

  const urls = [accounts, ...sites.sites.map((s) => s.databaseUrl)];
  const targets = urls.map((url) => ({ name: new URL(url).pathname.replace(/^\//, ""), url }));
  return { ok: true, dir: path.join(base, stamp(now)), databases: targets.map((t) => t.name), targets };
}
