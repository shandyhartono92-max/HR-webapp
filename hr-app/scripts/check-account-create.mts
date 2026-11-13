// Creating a staff account: when giving access to the location fails (its database
// down), the new account must not stay behind without access. Uses the real accounts
// database with a throwaway email, removed at the end.
import assert from "node:assert/strict";
import { accountsDb } from "@/lib/accounts-db";
import { createAccountWithAccess } from "@/lib/account-create";

const EMAIL = "uji.yatim@contoh.local";
const cleanup = () => accountsDb.account.deleteMany({ where: { email: EMAIL } });
await cleanup();
try {
  const failingGrant = async () => {
    throw new Error("Lokasi sedang tidak bisa diakses");
  };
  const r = await createAccountWithAccess({ name: "Uji Yatim", email: EMAIL, passwordHash: "x" }, "jakarta", "HR", failingGrant);
  assert.deepEqual(r, { ok: false, reason: "site" });
  assert.equal(await accountsDb.account.count({ where: { email: EMAIL } }), 0, "no account left without access");

  // The same email can be used right away once the location is back
  let granted = "";
  const okGrant = async (id: string, site: string, role: string | null) => {
    granted = `${site}:${role}`;
    void id;
  };
  const ok = await createAccountWithAccess({ name: "Uji Yatim", email: EMAIL, passwordHash: "x" }, "jakarta", "HR", okGrant);
  assert.equal(ok.ok, true);
  assert.equal(granted, "jakarta:HR");

  // A taken email is reported as such
  assert.deepEqual(await createAccountWithAccess({ name: "Lain", email: EMAIL, passwordHash: "x" }, "jakarta", "HR", okGrant), { ok: false, reason: "taken" });
} finally {
  await cleanup();
}
console.log("check-account-create: ok");
process.exit(0);
