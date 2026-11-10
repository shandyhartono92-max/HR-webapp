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

assert.equal(initials("Dewi Anggraini"), "DA");
assert.equal(initials("Administrator"), "AD");
assert.equal(initials("  budi  santoso tri "), "BS");
console.log("check-nav: ok");
