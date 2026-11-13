// Mirror users follow the account while it has access, and are only switched off once
// it has none: an anonymised mirror (retention) must keep its anonymised name and email.
// Uses the real accounts and Jakarta databases with its own throwaway account, removed at the end.
import assert from "node:assert/strict";
import { accountsDb } from "@/lib/accounts-db";
import { dbFor } from "@/lib/db";
import { setAccess, syncMirror } from "@/lib/site-access";

const EMAIL = "uji.mirror@contoh.local";
const site = "jakarta";
const db = dbFor(site);

const cleanup = async () => {
  const a = await accountsDb.account.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (a) {
    await db.user.deleteMany({ where: { id: a.id } });
    await accountsDb.account.delete({ where: { id: a.id } });
  }
};
await cleanup();

try {
  const account = await accountsDb.account.create({ data: { email: EMAIL, name: "Uji Mirror", passwordHash: "x" }, select: { id: true } });

  // Access creates the mirror at once, with the account's name and the role
  await setAccess(account.id, site, "HR");
  assert.deepEqual(await db.user.findUnique({ where: { id: account.id }, select: { name: true, email: true, role: true, isActive: true } }), {
    name: "Uji Mirror",
    email: EMAIL,
    role: "HR",
    isActive: true,
  });

  // First entry from two tabs at once: both syncs succeed, one mirror
  await db.user.deleteMany({ where: { id: account.id } });
  await Promise.all([syncMirror(account.id, site), syncMirror(account.id, site), syncMirror(account.id, site)]);
  assert.equal(await db.user.count({ where: { id: account.id } }), 1);

  // Retention anonymises the mirror, then removes the access: the mirror stays anonymous
  await db.user.update({ where: { id: account.id }, data: { name: "Karyawan dihapus", email: `dihapus-${account.id}@anonim.invalid` } });
  await setAccess(account.id, site, null);
  assert.deepEqual(await db.user.findUnique({ where: { id: account.id }, select: { name: true, email: true, isActive: true } }), {
    name: "Karyawan dihapus",
    email: `dihapus-${account.id}@anonim.invalid`,
    isActive: false,
  });
} finally {
  await cleanup();
}
console.log("check-mirror-sync: ok");
process.exit(0);
