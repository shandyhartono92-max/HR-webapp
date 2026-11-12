import assert from "node:assert/strict";
import { parseNewEmployee, SENSITIVE_FIELDS } from "@/lib/new-employee";

const today = new Date("2026-11-12T00:00:00Z");
const d = (s: string) => new Date(`${s}T00:00:00Z`);

// What the form sends for a permanent HO employee, nothing optional filled in
const base: Record<string, string> = {
  employeeNumber: " K-0100 ",
  contractNumber: "",
  fullName: "Budi Santoso",
  email: "Budi@Perusahaan.co.id",
  phone: "0812-3456-7890",
  departmentId: "dept-1",
  position: "Staf Gudang",
  workLocation: "HO",
  warehouse: "",
  employmentType: "PKWTT",
  status: "ACTIVE",
  joinDate: "2026-12-01",
  endDate: "",
  trainingStart: "",
  trainingEnd: "",
  birthPlace: "",
  birthDate: "",
  gender: "",
  address: "",
  motherMaidenName: "",
  ptkpStatus: "",
  nik: "",
  npwp: "",
  bpjsKesehatan: "",
  bpjsKetenagakerjaan: "",
};
const parse = (more: Record<string, string> = {}) => parseNewEmployee({ ...base, ...more }, today);
const errorsOf = (more: Record<string, string>) => {
  const r = parse(more);
  assert.equal(r.ok, false, `expected errors for ${JSON.stringify(more)}`);
  return r.ok ? {} : r.errors;
};

// ── The minimal valid employee ──────────────────────────────
const ok = parse();
assert.equal(ok.ok, true, JSON.stringify(ok));
if (ok.ok) {
  const e = ok.data;
  assert.equal(e.employeeNumber, "K-0100", "trimmed");
  assert.equal(e.contractNumber, "K-0100/MANUAL", "blank contract number is filled in");
  assert.equal(e.email, "budi@perusahaan.co.id", "lowercase");
  assert.equal(e.phone, "081234567890", "separators removed");
  assert.equal(e.workLocation, "HO");
  assert.equal(e.warehouse, null);
  assert.equal(e.status, "ACTIVE");
  assert.deepEqual(e.joinDate, d("2026-12-01"));
  assert.equal(e.endDate, null);
  assert.equal(e.birthDate, null);
  assert.equal(e.gender, null);
  assert.equal(e.nik, undefined, "no sensitive number typed");
}

// ── Required fields ─────────────────────────────────────────
const empty = errorsOf({ employeeNumber: "", fullName: "", email: "", phone: "", departmentId: "", position: "", workLocation: "", employmentType: "", joinDate: "" });
for (const key of ["employeeNumber", "fullName", "email", "phone", "departmentId", "position", "workLocation", "employmentType", "joinDate"]) {
  assert.ok(empty[key]?.length, `${key} is required`);
}
assert.deepEqual(errorsOf({ phone: "12345" }).phone, ["Masukkan nomor HP Indonesia, misal 0812xxxxxxx."]);
assert.deepEqual(errorsOf({ status: "RESIGNED" }).status, ["Pilih Aktif atau Masa percobaan."], "a new employee has not left");

// ── Contract rules (same as the Excel import) ───────────────
assert.deepEqual(errorsOf({ employmentType: "PKWT" }).endDate, ["Kontrak PKWT wajib punya tanggal berakhir."]);
assert.deepEqual(errorsOf({ employmentType: "PKWT", endDate: "2026-11-30" }).endDate, ["Tanggal berakhir harus setelah tanggal mulai."]);
assert.deepEqual(errorsOf({ employmentType: "PKWT", endDate: "2027-11-30", status: "PROBATION" }).status, ["Kontrak PKWT tidak boleh ada masa percobaan."]);
assert.equal(parse({ employmentType: "PKWT", endDate: "2027-11-30" }).ok, true);

// A contract that already ended cannot be added as Aktif; one ending today still runs
const endedMsg = errorsOf({ employmentType: "PKWT", joinDate: "2025-11-12", endDate: "2026-11-11" }).endDate;
assert.equal(endedMsg?.length, 1);
assert.match(endedMsg![0], /^Kontrak ini sudah berakhir/);
assert.equal(parse({ employmentType: "PKWT", joinDate: "2025-11-12", endDate: "2026-11-12" }).ok, true, "ends today");
// Only one endDate message when the end is also before the start
assert.deepEqual(errorsOf({ employmentType: "PKWT", joinDate: "2026-01-01", endDate: "2025-01-01" }).endDate, ["Tanggal berakhir harus setelah tanggal mulai."]);

// Whether the contract number was filled in by the app (decides where a clash is shown)
const auto = parse();
const typed = parse({ contractNumber: "012/PKWTT/XII/2026" });
assert.ok(auto.ok && auto.data.contractNumberAuto === true);
assert.ok(typed.ok && typed.data.contractNumberAuto === false && typed.data.contractNumber === "012/PKWTT/XII/2026");

// A training ID is T followed by a number; "TUJI01" is not one, and the message says so
assert.deepEqual(errorsOf({ employeeNumber: "TUJI01", trainingStart: "2026-12-01", trainingEnd: "2026-12-20" }).employeeNumber, [
  "Selama training, Employee ID harus berawalan huruf T lalu angka (misal T001 atau T-001).",
]);

// ── Location (shared rules) ─────────────────────────────────
assert.deepEqual(errorsOf({ workLocation: "OPS" }).warehouse, ["Isi nama warehouse untuk lokasi OPS."]);
const ops = parse({ workLocation: "OPS", warehouse: " Gudang Cikarang " });
assert.equal(ops.ok && ops.data.warehouse, "Gudang Cikarang");

// ── Training (shared rules) ─────────────────────────────────
assert.ok(errorsOf({ trainingStart: "2026-12-01" }).trainingEnd?.length, "both training dates or none");
assert.ok(errorsOf({ trainingStart: "2026-12-01", trainingEnd: "2027-02-28" }).employeeNumber?.length, "a trainee's ID starts with T");
assert.equal(parse({ employeeNumber: "T100", trainingStart: "2026-12-01", trainingEnd: "2027-02-28" }).ok, true);

// ── Personal data and sensitive numbers ─────────────────────
// NIK 320101 150895 0001 = born 15 Aug 1995, male
const person = { birthDate: "1995-08-15", gender: "L", nik: "3201-0115-0895-0001" };
const withNik = parse(person);
assert.equal(withNik.ok, true, JSON.stringify(withNik));
assert.equal(withNik.ok && withNik.data.nik, "3201011508950001", "digits only");
assert.deepEqual(errorsOf({ ...person, birthDate: "1995-08-16" }).nik, ["NIK tidak cocok dengan tanggal lahir. Periksa kembali NIK atau tanggal lahir."]);
assert.deepEqual(errorsOf({ ...person, gender: "P" }).nik, ["NIK tidak cocok dengan jenis kelamin. Periksa kembali NIK atau jenis kelamin."]);
assert.deepEqual(errorsOf({ nik: "123" }).nik, ["NIK harus 16 digit angka."]);
assert.deepEqual(errorsOf({ npwp: "12" }).npwp, ["NPWP harus 15 atau 16 digit angka."]);
assert.deepEqual(errorsOf({ bpjsKesehatan: "12" }).bpjsKesehatan, ["Nomor BPJS Kesehatan harus 13 digit angka."]);
assert.deepEqual(errorsOf({ bpjsKetenagakerjaan: "12" }).bpjsKetenagakerjaan, ["Nomor BPJS Ketenagakerjaan (KPJ) harus 11 digit angka."]);
const full = parse({ ...person, npwp: "320101150895000", bpjsKesehatan: "0001234567890", bpjsKetenagakerjaan: "12345678901", ptkpStatus: "TK0", address: "Jl. Uji 1", motherMaidenName: "Siti" });
assert.equal(full.ok, true, JSON.stringify(full));

// Never sent back to the browser
assert.deepEqual([...SENSITIVE_FIELDS], ["nik", "npwp", "bpjsKesehatan", "bpjsKetenagakerjaan"]);

console.log("check-new-employee: ok");
