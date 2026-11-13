import assert from "node:assert/strict";
import { accessError, employeeLoginError, formSiteError } from "@/lib/access-rules";

const label = (c: string) => ({ batam: "Batam", jakarta: "Jakarta", medan: "Medan" })[c] ?? c;

// Access to the chosen location
assert.equal(accessError([{ site: "batam" }], "batam", label), null);
assert.equal(accessError([{ site: "batam" }, { site: "jakarta" }], "jakarta", label), null);

// No access: the message names the one other location the account belongs to
assert.equal(accessError([{ site: "batam" }], "jakarta", label), "Akun ini tidak punya akses ke Jakarta. Akun ini terdaftar di Batam.");
// …and says nothing more when there is none, or more than one
assert.equal(accessError([], "jakarta", label), "Akun ini tidak punya akses ke Jakarta.");
assert.equal(accessError([{ site: "batam" }, { site: "medan" }], "jakarta", label), "Akun ini tidak punya akses ke Jakarta.");

// ── An employee login may only take over an employee-only account of this location ──
const STAFF = "Email ini dipakai akun staf atau akun di lokasi lain. Hanya Admin yang bisa menghubungkannya, lewat menu Pengguna.";
// A brand-new email, or the employee's own login here: fine for HR
assert.equal(employeeLoginError([], "jakarta", "HR"), null);
assert.equal(employeeLoginError([{ site: "jakarta", role: "EMPLOYEE" }], "jakarta", "HR"), null);
// A staff account (any location) or an account of another location: refused for HR…
assert.equal(employeeLoginError([{ site: "batam", role: "ADMIN" }], "jakarta", "HR"), STAFF);
assert.equal(employeeLoginError([{ site: "jakarta", role: "HR" }], "jakarta", "HR"), STAFF);
assert.equal(employeeLoginError([{ site: "batam", role: "EMPLOYEE" }], "jakarta", "HR"), STAFF);
// …but an Admin may (they could do the same on Pengguna)
assert.equal(employeeLoginError([{ site: "batam", role: "ADMIN" }], "jakarta", "ADMIN"), null);

// ── A form opened in one location may not save into another ──
assert.equal(formSiteError("batam", "batam"), null);
assert.equal(formSiteError("batam", "jakarta"), "Lokasi aktif sudah berganti ke tab lain. Muat ulang halaman ini, lalu isi lagi.");
assert.equal(formSiteError(null, "jakarta"), "Lokasi aktif sudah berganti ke tab lain. Muat ulang halaman ini, lalu isi lagi.");

console.log("check-site-access: ok");
