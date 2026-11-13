// Daily retention job. Run once a day (cron, Windows Task Scheduler, or your host's scheduler):
//   npm run retention            -> anonymise expired candidates and former employees
//   npm run retention -- --dry-run  -> only list who would be anonymised
import "dotenv/config";
import { anonymizeExpiredCandidates, anonymizeFormerEmployees, employeeRetentionYears } from "@/lib/retention";
import { sites } from "@/lib/sites";
import { withSite } from "@/lib/site-context";

const dryRun = process.argv.includes("--dry-run");
const verb = dryRun ? "Akan dianonimkan" : "Dianonimkan";

// Every location in turn; each one's counts are printed under its name
async function main() {
  let errors = 0;
  for (const site of sites()) {
    const { c, e } = await withSite(site.code, async () => ({
      c: await anonymizeExpiredCandidates({ dryRun }),
      e: await anonymizeFormerEmployees({ dryRun }),
    }));
    console.log(`[${site.label}] ${verb}: ${c.candidateIds.length} kandidat`);
    console.log(`[${site.label}] ${verb}: ${e.employeeIds.length} mantan karyawan (keluar lebih dari ${employeeRetentionYears()} tahun lalu)`);
    if (!dryRun) console.log(`[${site.label}] File dihapus: ${c.filesDeleted + e.filesDeleted}${c.fileErrors + e.fileErrors ? `, gagal: ${c.fileErrors + e.fileErrors}` : ""}`);
    errors += c.fileErrors + e.fileErrors;
  }
  return errors ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
