import assert from "node:assert/strict";
import { lastAdminError } from "@/lib/access-rules";

const MSG = "Tidak bisa mencabut akses ADMIN terakhir milik Anda sendiri.";
const access = [
  { accountId: "me", site: "batam", role: "ADMIN" as const },
  { accountId: "other", site: "batam", role: "HR" as const },
  { accountId: "other", site: "jakarta", role: "ADMIN" as const },
];
const one = (accountId: string, site: string, role: string | null) => [{ accountId, site, role }];

// Removing or demoting the actor's only ADMIN access is refused
assert.equal(lastAdminError(access, one("me", "batam", null), "me"), MSG);
assert.equal(lastAdminError(access, one("me", "batam", "HR"), "me"), MSG);
// Keeping ADMIN, or adding access elsewhere, is fine
assert.equal(lastAdminError(access, one("me", "batam", "ADMIN"), "me"), null);
assert.equal(lastAdminError(access, one("me", "jakarta", "HR"), "me"), null);

// With ADMIN in another location too, giving up one of them is fine…
const both = [...access, { accountId: "me", site: "jakarta", role: "ADMIN" as const }];
assert.equal(lastAdminError(both, one("me", "batam", null), "me"), null);
// …but not both in one save
assert.equal(lastAdminError(both, [...one("me", "batam", "HR"), ...one("me", "jakarta", null)], "me"), MSG);
// Moving ADMIN from one location to another in one save is fine
assert.equal(lastAdminError(access, [...one("me", "batam", "HR"), ...one("me", "jakarta", "ADMIN")], "me"), null);

// Changes to another account are not this rule's business
assert.equal(lastAdminError(access, one("other", "jakarta", null), "me"), null);

console.log("check-account-admin: ok");
