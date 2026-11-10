import { graduateTrainees } from "@/lib/training-job";

// Trainee numbers (T001 → 001) the day after training ends: at start-up, then hourly.
// Not awaited, so a slow database never delays the server becoming ready.
const HOUR = 60 * 60 * 1000;
const flag = globalThis as unknown as { trainingJobStarted?: boolean };

async function run() {
  try {
    const { graduated, clashes } = await graduateTrainees();
    for (const g of graduated) console.log(`[training] Employee ID ${g.from} → ${g.to}`);
    for (const c of clashes) console.warn(`[training] ${c.employeeNumber}: ${c.wanted} sudah dipakai, ID tidak diganti`);
  } catch (e) {
    console.error("[training] pengecekan training gagal:", e instanceof Error ? e.message : e);
  }
}

// Dev reloads can import this module again; start the timer only once per process
if (!flag.trainingJobStarted) {
  flag.trainingJobStarted = true;
  void run();
  setInterval(run, HOUR).unref();
}
