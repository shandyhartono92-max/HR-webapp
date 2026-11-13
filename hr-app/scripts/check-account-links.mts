// Kelola pengguna decides by the employee records an account is linked to in EVERY
// location, not only the one being viewed. Real accounts + Jakarta databases with a
// throwaway account and employee, removed at the end.
import assert from "node:assert/strict";
import { accountsDb } from "@/lib/accounts-db";
import { dbFor } from "@/lib/db";
import { setAccess } from "@/lib/site-access";
import { employeeLinks, linkSummary } from "@/lib/account-links";

// ── Summary rules (pure) ──
const active = { site: "jakarta", status: "ACTIVE", anonymizedAt: null };
const left = { site: "batam", status: "RESIGNED", anonymizedAt: null };
const gone = { site: "batam", status: "RESIGNED", anonymizedAt: new Date() };
assert.deepEqual(linkSummary([]), { linked: false, anonymized: false, allLeft: false });
assert.deepEqual(linkSummary([active]), { linked: true, anonymized: false, allLeft: false });
assert.deepEqual(linkSummary([left]), { linked: true, anonymized: false, allLeft: true });
assert.deepEqual(linkSummary([left, active]), { linked: true, anonymized: false, allLeft: false });
assert.deepEqual(linkSummary([gone]), { linked: true, anonymized: true, allLeft: true });

// ── Links are found in another location ──
const EMAIL = "uji.tautan@contoh.local";
const db = dbFor("jakarta");
const cleanup = async () => {
  const a = await accountsDb.account.findUnique({ where: { email: EMAIL }, select: { id: true } });
  await db.employee.deleteMany({ where: { employeeNumber: "UJI-TAUTAN-1" } });
  if (a) {
    await db.user.deleteMany({ where: { id: a.id } });
    await accountsDb.account.delete({ where: { id: a.id } });
  }
};
await cleanup();
try {
  const account = await accountsDb.account.create({ data: { email: EMAIL, name: "Uji Tautan", passwordHash: "x" }, select: { id: true } });
  await setAccess(account.id, "jakarta", "EMPLOYEE");
  const dept = await db.department.upsert({ where: { name: "Uji Tautan" }, update: {}, create: { name: "Uji Tautan" } });
  await db.employee.create({
    data: { employeeNumber: "UJI-TAUTAN-1", fullName: "Uji Tautan", email: EMAIL, phone: "081234567890", departmentId: dept.id, position: "Staf", employmentType: "PKWTT", status: "ACTIVE", joinDate: new Date("2026-11-01"), workLocation: "HO", userId: account.id },
  });
  const links = await employeeLinks(account.id);
  assert.deepEqual(links.map((l) => [l.site, l.status, l.anonymizedAt]), [["jakarta", "ACTIVE", null]]);
  await db.department.delete({ where: { id: dept.id } }).catch(() => {});
} finally {
  await cleanup();
  await db.department.deleteMany({ where: { name: "Uji Tautan" } });
}
console.log("check-account-links: ok");
process.exit(0);
