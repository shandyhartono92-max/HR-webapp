import { graduateTrainees } from "@/lib/training-job";
import { sites } from "@/lib/sites";
import { withSite } from "@/lib/site-context";

// Trainee numbers (T001 → 001) the day after training ends: at start-up, then hourly,
// for every location in turn. One location failing (its database down) is logged and
// does not stop the others. Not awaited, so a slow database never delays the server.
const HOUR = 60 * 60 * 1000;
const flag = globalThis as unknown as { trainingJobStarted?: boolean };

async function run() {
  for (const { code } of sites()) {
    try {
      const { graduated, clashes } = await withSite(code, () => graduateTrainees());
      for (const g of graduated) console.log(`[training:${code}] Employee ID ${g.from} → ${g.to}`);
      for (const c of clashes) console.warn(`[training:${code}] ${c.employeeNumber}: ${c.wanted} sudah dipakai, ID tidak diganti`);
    } catch (e) {
      console.error(`[training:${code}] pengecekan training gagal:`, e instanceof Error ? e.message : e);
    }
  }
}

// Dev reloads can import this module again; start the timer only once per process
if (!flag.trainingJobStarted) {
  flag.trainingJobStarted = true;
  void run();
  setInterval(run, HOUR).unref();
}
