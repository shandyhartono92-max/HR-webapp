import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { createFirstAdmin } from "@/lib/first-admin";
import { accountsDb } from "@/lib/accounts-db";
import { dbFor } from "@/lib/db";
import { setAccess } from "@/lib/site-access";
import { sites } from "@/lib/sites";

const email = `cek.admin.${Date.now()}@contoh.local`;
const failEmail = `cek.admin.gagal.${Date.now()}@contoh.local`;

async function cleanup() {
  for (const e of [email, failEmail]) {
    const acc = await accountsDb.account.findUnique({ where: { email: e }, select: { id: true } });
    if (!acc) continue;
    for (const { code } of sites()) await dbFor(code).user.deleteMany({ where: { id: acc.id } });
    await accountsDb.account.delete({ where: { id: acc.id } });
  }
}

try {
  // Input is checked before anything is written
  assert.deepEqual(await createFirstAdmin({ email: "bukan-email", name: "Admin" }), { ok: false, reason: "invalid" });
  assert.deepEqual(await createFirstAdmin({ email, name: " " }), { ok: false, reason: "invalid" });

  // Created: ADMIN in every location, a mirror in each, must change the password
  const made = await createFirstAdmin({ email: `  ${email.toUpperCase()} `, name: "Admin Utama" });
  assert.ok(made.ok);
  assert.equal(made.password.length, 12);
  const acc = await accountsDb.account.findUniqueOrThrow({ where: { email }, include: { access: true } });
  assert.equal(acc.mustChangePassword, true);
  assert.equal(acc.name, "Admin Utama");
  assert.ok(await bcrypt.compare(made.password, acc.passwordHash));
  assert.deepEqual(acc.access.map((a) => `${a.site}:${a.role}`).sort(), sites().map((s) => `${s.code}:ADMIN`).sort());
  for (const { code } of sites()) {
    const mirror = await dbFor(code).user.findUniqueOrThrow({ where: { id: acc.id } });
    assert.equal(mirror.role, "ADMIN");
    assert.equal(mirror.isActive, true);
  }

  // The same email again is refused, nothing changes
  assert.deepEqual(await createFirstAdmin({ email, name: "Lagi" }), { ok: false, reason: "taken" });

  // A location that cannot be reached: the account is removed again
  const last = sites().at(-1)!.code;
  const flaky = async (id: string, site: Parameters<typeof setAccess>[1], role: Parameters<typeof setAccess>[2]) => {
    if (site === last) throw new Error("database down");
    await setAccess(id, site, role);
  };
  assert.deepEqual(await createFirstAdmin({ email: failEmail, name: "Gagal" }, flaky), { ok: false, reason: "site", site: last });
  assert.equal(await accountsDb.account.count({ where: { email: failEmail } }), 0);
  // ...and so are the mirrors already written in the other locations
  for (const { code } of sites()) assert.equal(await dbFor(code).user.count({ where: { email: failEmail } }), 0);

  console.log("check-first-admin: ok");
} finally {
  await cleanup();
}
process.exit(0);
