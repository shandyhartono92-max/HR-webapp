import assert from "node:assert/strict";
import { activeHref, initials, navGroupsFor } from "@/lib/nav";
import type { Role } from "@/generated/prisma/enums";

const labels = (r: Role) => navGroupsFor(r).map((g) => [g.title, g.items.map((i) => i.label)]);
assert.deepEqual(labels("EMPLOYEE"), [["Utama", ["Ringkasan"]], ["Karyawan", ["Rekening Gaji"]], ["Pengaturan", ["Akun Saya"]]]);
assert.ok(!labels("HIRING_MANAGER").flat(2).includes("Bank Kandidat"));
assert.ok(!labels("HR").flat(2).includes("Pengguna"));
assert.ok(labels("ADMIN").flat(2).includes("Pengguna"));
assert.deepEqual(navGroupsFor("ADMIN").map((g) => g.title), ["Utama", "Rekrutmen", "Karyawan", "Pengaturan"]);

const hrefs = navGroupsFor("ADMIN").flatMap((g) => g.items).flatMap((i) => (i.href ? [i.href] : []));
assert.equal(activeHref("/dashboard", hrefs), "/dashboard");
assert.equal(activeHref("/dashboard/kandidat/bank/import", hrefs), "/dashboard/kandidat/bank");
assert.equal(activeHref("/dashboard/kandidat/abc", hrefs), "/dashboard/kandidat");
assert.equal(activeHref("/dashboard/karyawan/abc", hrefs), "/dashboard/karyawan");
assert.equal(activeHref("/dashboard/karyawanx", hrefs), null);
assert.equal(activeHref("/dashboard/lowongan/baru", hrefs), "/dashboard/lowongan");

// Tenaga Kerja Asing: HR and Admin, in the Karyawan group right after Karyawan
const karyawanGroup = (r: Role) => navGroupsFor(r).find((g) => g.title === "Karyawan")?.items.map((i) => i.label) ?? [];
assert.deepEqual(karyawanGroup("HR").slice(0, 2), ["Karyawan", "Tenaga Kerja Asing"]);
assert.deepEqual(karyawanGroup("ADMIN").slice(0, 2), ["Karyawan", "Tenaga Kerja Asing"]);
assert.ok(!karyawanGroup("EMPLOYEE").includes("Tenaga Kerja Asing"));
assert.ok(!labels("HIRING_MANAGER").flat(2).includes("Tenaga Kerja Asing"));
assert.equal(activeHref("/dashboard/tka/abc", hrefs), "/dashboard/tka");

assert.equal(initials("Dewi Anggraini"), "DA");
assert.equal(initials("Administrator"), "AD");
assert.equal(initials("  budi  santoso tri "), "BS");
console.log("check-nav: ok");
