import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { buildEmployeeTemplate, parseEmployeeFile } from "@/lib/employee-import";

// Fills the real template's "Karyawan" sheet by header text, the way HR would
async function fileWith(rows: Record<string, string>[], dropHeader?: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildEmployeeTemplate()) as unknown as ArrayBuffer);
  const sheet = wb.getWorksheet("Karyawan")!;
  const col = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, n) => col.set(String(cell.value), n));
  if (dropHeader) sheet.getRow(1).getCell(col.get(dropHeader)!).value = "Kolom lain";
  rows.forEach((row, i) => {
    for (const [header, value] of Object.entries(row)) {
      const n = col.get(header);
      assert.ok(n, `template has no column "${header}"`);
      sheet.getRow(i + 2).getCell(n).value = value;
    }
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const base = (n: number, more: Record<string, string> = {}) => ({
  "Employee ID *": `UJI-LOK-${n}`,
  "Nama lengkap *": `Uji Lokasi ${n}`,
  "Email *": `uji.lokasi${n}@contoh.local`,
  "No. HP / WhatsApp *": "081234567890",
  "Departemen *": "Gudang",
  "Jabatan *": "Staf Gudang",
  "Jenis karyawan *": "Tetap (PKWTT)",
  "Tanggal mulai *": "01/02/2026",
  ...more,
});

// Valid rows: HO without a warehouse, OPS with one (code or full name, any case)
const good = await parseEmployeeFile(
  await fileWith([
    base(1, { "Lokasi *": "HO" }),
    base(2, { "Lokasi *": "OPS", Warehouse: "  Gudang Cikarang " }),
    base(3, { "Lokasi *": "operational", Warehouse: "Gudang Surabaya" }),
    base(4, { "Lokasi *": "HO", Warehouse: "sisa ketikan" }),
    // Ignored for HO, so its length does not matter either
    base(9, { "Lokasi *": "HO", Warehouse: "x".repeat(150) }),
  ]),
);
assert.equal(good.ok, true, JSON.stringify(good));
if (good.ok) {
  assert.deepEqual(
    good.rows.map((r) => [r.workLocation, r.warehouse]),
    [
      ["HO", null],
      ["OPS", "Gudang Cikarang"],
      ["OPS", "Gudang Surabaya"],
      ["HO", null],
      ["HO", null],
    ],
    "HO never keeps a warehouse",
  );
}

// Wrong rows: location missing or unknown, OPS without a warehouse
const bad = await parseEmployeeFile(
  await fileWith([
    base(5),
    base(6, { "Lokasi *": "Gudang" }),
    base(7, { "Lokasi *": "OPS" }),
    base(10, { "Lokasi *": "OPS", Warehouse: "x".repeat(101) }),
  ]),
);
assert.equal(bad.ok, false);
if (!bad.ok) {
  const byRow = Object.fromEntries((bad.issues ?? []).map((i) => [i.rowNumber, i.messages]));
  assert.deepEqual(byRow[2], ["Lokasi: Isi HO atau OPS."]);
  assert.deepEqual(byRow[3], ["Lokasi: Isi HO atau OPS."]);
  assert.deepEqual(byRow[4], ["Warehouse: Wajib diisi untuk lokasi OPS."]);
  assert.deepEqual(byRow[5], ["Warehouse: Maksimal 100 karakter."]);
}

// A file from the old template (no Lokasi column) is refused with a clear message
const old = await parseEmployeeFile(await fileWith([base(8)], "Lokasi *"));
assert.equal(old.ok, false);
if (!old.ok) assert.match(old.message, /Kolom tidak ditemukan: "Lokasi \*"/);

console.log("check-employee-import: ok");
