// Daily retention job. Run once a day (cron, Windows Task Scheduler, or your host's scheduler):
//   npm run retention            -> anonymise expired candidates and former employees
//   npm run retention -- --dry-run  -> only list who would be anonymised
import "dotenv/config";
import { anonymizeExpiredCandidates, anonymizeFormerEmployees, employeeRetentionYears } from "@/lib/retention";

const dryRun = process.argv.includes("--dry-run");
const verb = dryRun ? "Akan dianonimkan" : "Dianonimkan";

async function main() {
  const c = await anonymizeExpiredCandidates({ dryRun });
  console.log(`${verb}: ${c.candidateIds.length} kandidat`);
  const e = await anonymizeFormerEmployees({ dryRun });
  console.log(`${verb}: ${e.employeeIds.length} mantan karyawan (keluar lebih dari ${employeeRetentionYears()} tahun lalu)`);
  if (!dryRun) console.log(`File dihapus: ${c.filesDeleted + e.filesDeleted}${c.fileErrors + e.fileErrors ? `, gagal: ${c.fileErrors + e.fileErrors}` : ""}`);
  return c.fileErrors + e.fileErrors ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
