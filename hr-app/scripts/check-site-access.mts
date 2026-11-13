import assert from "node:assert/strict";
import { accessError } from "@/lib/access-rules";

const label = (c: string) => ({ batam: "Batam", jakarta: "Jakarta", medan: "Medan" })[c] ?? c;

// Access to the chosen location
assert.equal(accessError([{ site: "batam" }], "batam", label), null);
assert.equal(accessError([{ site: "batam" }, { site: "jakarta" }], "jakarta", label), null);

// No access: the message names the one other location the account belongs to
assert.equal(accessError([{ site: "batam" }], "jakarta", label), "Akun ini tidak punya akses ke Jakarta. Akun ini terdaftar di Batam.");
// …and says nothing more when there is none, or more than one
assert.equal(accessError([], "jakarta", label), "Akun ini tidak punya akses ke Jakarta.");
assert.equal(accessError([{ site: "batam" }, { site: "medan" }], "jakarta", label), "Akun ini tidak punya akses ke Jakarta.");

console.log("check-site-access: ok");
