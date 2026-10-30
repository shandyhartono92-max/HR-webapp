// Daily retention job. Run once a day (cron, Windows Task Scheduler, or your host's scheduler):
//   npm run retention            -> anonymise expired candidates
//   npm run retention -- --dry-run  -> only list who would be anonymised
import "dotenv/config";
import { anonymizeExpiredCandidates } from "@/lib/retention";

const dryRun = process.argv.includes("--dry-run");

anonymizeExpiredCandidates({ dryRun })
  .then((r) => {
    const verb = dryRun ? "Akan dianonimkan" : "Dianonimkan";
    console.log(`${verb}: ${r.candidateIds.length} kandidat`);
    if (!dryRun) console.log(`File CV dihapus: ${r.filesDeleted}${r.fileErrors ? `, gagal: ${r.fileErrors}` : ""}`);
    process.exit(r.fileErrors ? 1 : 0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
