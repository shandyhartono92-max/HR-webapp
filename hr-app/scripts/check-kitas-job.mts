// KITAS notifications from the hourly job. Runs against the Jakarta database with
// throwaway workers (names start "Uji KITAS"), removed at the end with their notifications.
import assert from "node:assert/strict";
import { dbFor } from "@/lib/db";
import { withSite } from "@/lib/site-context";
import { notifyKitasExpiry } from "@/lib/kitas-job";
import { kitasRenewalData } from "@/lib/foreign-workers";

const db = dbFor("jakarta");
const today = new Date("2026-11-13T00:00:00Z");
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const staff = await db.user.count({ where: { role: { in: ["ADMIN", "HR"] }, isActive: true } });
assert.ok(staff > 0, "Jakarta needs at least one active HR/Admin user for this check");

const cleanup = async () => {
  const ws = await db.foreignWorker.findMany({ where: { fullName: { startsWith: "Uji KITAS" } }, select: { id: true } });
  await db.notification.deleteMany({ where: { link: { in: ws.map((w) => `/dashboard/tka/${w.id}`) } } });
  await db.foreignWorker.deleteMany({ where: { id: { in: ws.map((w) => w.id) } } });
};
const make = (n: number, kitasExpiry: string, status: "ACTIVE" | "INACTIVE" = "ACTIVE") =>
  db.foreignWorker.create({
    data: { fullName: `Uji KITAS ${n}`, passportNumber: `UJIKP${n}`, kitasNumber: `UJIKK${n}`, passportExpiry: d("2030-01-01"), kitasExpiry: d(kitasExpiry), location: "Uji", status },
    select: { id: true },
  });
const notices = async (id: string) =>
  db.notification.groupBy({ by: ["type"], where: { link: `/dashboard/tka/${id}` }, _count: true }).then((r) => Object.fromEntries(r.map((x) => [x.type, x._count])));
const run = () => withSite("jakarta", () => notifyKitasExpiry(today));

await cleanup();
try {
  const soon = await make(1, "2026-12-03"); // 20 days left
  const expired = await make(2, "2026-11-10"); // already expired, never notified
  const inactive = await make(3, "2026-11-01", "INACTIVE");
  const later = await make(4, "2027-06-30"); // far away

  // First run: one "soon" and one "expired" per staff user, nothing for the others
  assert.deepEqual(await run(), { soon: 1, expired: 1 });
  assert.deepEqual(await notices(soon.id), { kitas_soon: staff });
  // already expired gets one notice
  assert.deepEqual(await notices(expired.id), { kitas_expired: staff });
  assert.deepEqual(await notices(inactive.id), {});
  assert.deepEqual(await notices(later.id), {});

  // Second run: nothing new
  assert.deepEqual(await run(), { soon: 0, expired: 0 });
  assert.deepEqual(await notices(soon.id), { kitas_soon: staff });

  // renewal resets notices: a new date clears the markers, the next cycle notifies again
  const before = await db.foreignWorker.findUniqueOrThrow({ where: { id: soon.id }, select: { kitasExpiry: true } });
  await db.foreignWorker.update({ where: { id: soon.id }, data: { kitasExpiry: d("2026-12-05"), ...kitasRenewalData(before.kitasExpiry, d("2026-12-05")) } });
  assert.deepEqual(await run(), { soon: 1, expired: 0 });
  assert.deepEqual(await notices(soon.id), { kitas_soon: staff * 2 });

  // Two job runs at once (two server processes) still send one notice per staff user
  const twice = await make(5, "2026-12-01");
  await Promise.all([run(), run()]);
  assert.deepEqual(await notices(twice.id), { kitas_soon: staff });

  // A renewal saved while the job is working: the job must not stamp the renewed record
  const raced = await make(6, "2026-12-02");
  const job = withSite("jakarta", async () => {
    const p = notifyKitasExpiry(today);
    // Renew right away, in parallel with the job
    await db.foreignWorker.update({ where: { id: raced.id }, data: { kitasExpiry: d("2027-12-02"), ...kitasRenewalData(d("2026-12-02"), d("2027-12-02")) } });
    return p;
  });
  await job;
  const after = await db.foreignWorker.findUniqueOrThrow({ where: { id: raced.id }, select: { kitasExpiry: true, kitasSoonNoticeAt: true } });
  assert.equal(after.kitasExpiry.toISOString().slice(0, 10), "2027-12-02");
  assert.equal(after.kitasSoonNoticeAt, null, "the renewed KITAS keeps its next soon notice");

  // The notification names the worker first (retention looks for "<name> · ")
  const n = await db.notification.findFirstOrThrow({ where: { link: `/dashboard/tka/${expired.id}` }, select: { title: true, body: true } });
  assert.equal(n.title, "KITAS sudah habis");
  assert.match(n.body, /^Uji KITAS 2 · KITAS UJIKK2 berlaku sampai 10 Nov 2026\.$/);
} finally {
  await cleanup();
}
console.log("check-kitas-job: ok");
process.exit(0);
