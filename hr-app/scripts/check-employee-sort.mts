import assert from "node:assert/strict";
import { nextSort, parseSort, sortEmployees, type SortableEmployee } from "@/lib/employee-sort";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const emp = (employeeNumber: string, fullName: string, more: Partial<SortableEmployee> = {}): SortableEmployee => ({
  employeeNumber,
  fullName,
  department: { name: "Keuangan" },
  employmentType: "PKWTT",
  status: "ACTIVE",
  joinDate: d("2026-01-01"),
  endDate: null,
  workLocation: null,
  warehouse: null,
  ...more,
});
const names = (rows: SortableEmployee[]) => rows.map((e) => e.fullName);

// URL parsing: unknown keys mean the default order, unknown directions mean A-Z
assert.deepEqual(parseSort("nama", "za"), { key: "nama", dir: "za" });
assert.deepEqual(parseSort("nama", "x"), { key: "nama", dir: "az" });
assert.equal(parseSort("gaji", "az"), null);
assert.equal(parseSort(undefined, "az"), null);
assert.equal(parseSort(["nama"], "az"), null);

// Clicking: same column flips, another column starts at A-Z
assert.deepEqual(nextSort(null, "nama"), { key: "nama", dir: "az" });
assert.deepEqual(nextSort({ key: "nama", dir: "az" }, "nama"), { key: "nama", dir: "za" });
assert.deepEqual(nextSort({ key: "nama", dir: "za" }, "nama"), { key: "nama", dir: "az" });
assert.deepEqual(nextSort({ key: "nama", dir: "za" }, "id"), { key: "id", dir: "az" });

// Employee ID: numbers inside compare as numbers
const ids = [emp("K-10", "A"), emp("K-2", "B"), emp("k-1", "C")];
assert.deepEqual(names(sortEmployees(ids, { key: "id", dir: "az" })), ["C", "B", "A"]);
assert.deepEqual(names(sortEmployees(ids, { key: "id", dir: "za" })), ["A", "B", "C"]);

// Name: case-insensitive; the input array is not changed
const people = [emp("1", "budi"), emp("2", "Andi"), emp("3", "Citra")];
assert.deepEqual(names(sortEmployees(people, { key: "nama", dir: "az" })), ["Andi", "budi", "Citra"]);
assert.deepEqual(names(sortEmployees(people, { key: "nama", dir: "za" })), ["Citra", "budi", "Andi"]);
assert.deepEqual(names(people), ["budi", "Andi", "Citra"]);

// Labels, not enum codes: "Kontrak (PKWT)" < "Magang" < "Tetap (PKWTT)"
const types = [emp("1", "T", { employmentType: "PKWTT" }), emp("2", "M", { employmentType: "MAGANG" }), emp("3", "K", { employmentType: "PKWT" })];
assert.deepEqual(names(sortEmployees(types, { key: "jenis", dir: "az" })), ["K", "M", "T"]);

// Ties fall back to the name A-Z, in both directions
const sameDept = [emp("1", "Zaki"), emp("2", "Ayu"), emp("3", "Mira", { department: { name: "HR" } })];
assert.deepEqual(names(sortEmployees(sameDept, { key: "departemen", dir: "az" })), ["Mira", "Ayu", "Zaki"]);
assert.deepEqual(names(sortEmployees(sameDept, { key: "departemen", dir: "za" })), ["Ayu", "Zaki", "Mira"]);

// Dates: oldest first for A-Z
const joins = [emp("1", "B", { joinDate: d("2025-05-01") }), emp("2", "A", { joinDate: d("2026-02-01") }), emp("3", "C", { joinDate: d("2024-01-01") })];
assert.deepEqual(names(sortEmployees(joins, { key: "mulai", dir: "az" })), ["C", "B", "A"]);
assert.deepEqual(names(sortEmployees(joins, { key: "mulai", dir: "za" })), ["A", "B", "C"]);

// Contract end: rows without an end date stay last either way
const ends = [emp("1", "Tetap"), emp("2", "Lama", { endDate: d("2026-12-01") }), emp("3", "Baru", { endDate: d("2027-06-01") }), emp("4", "Abadi")];
assert.deepEqual(names(sortEmployees(ends, { key: "berakhir", dir: "az" })), ["Lama", "Baru", "Abadi", "Tetap"]);
assert.deepEqual(names(sortEmployees(ends, { key: "berakhir", dir: "za" })), ["Baru", "Lama", "Abadi", "Tetap"]);

// Location: "HO" < "OPS · Gudang A" < "OPS · Gudang B"; not filled in yet stays last either way
const places = [
  emp("1", "Belum"),
  emp("2", "Opsb", { workLocation: "OPS", warehouse: "Gudang B" }),
  emp("3", "Kantor", { workLocation: "HO" }),
  emp("4", "Opsa", { workLocation: "OPS", warehouse: "gudang a" }),
];
assert.deepEqual(names(sortEmployees(places, { key: "lokasi", dir: "az" })), ["Kantor", "Opsa", "Opsb", "Belum"]);
assert.deepEqual(names(sortEmployees(places, { key: "lokasi", dir: "za" })), ["Opsb", "Opsa", "Kantor", "Belum"]);
assert.deepEqual(parseSort("lokasi", "az"), { key: "lokasi", dir: "az" });

console.log("check-employee-sort: ok");
