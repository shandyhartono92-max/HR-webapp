import "server-only";
import * as z from "zod";
import { employmentTypeLabel, genderLabel, parseDateOnly, todayDate } from "@/lib/labels";
import { trainingErrors } from "@/lib/training";
import { parseWorkLocation, WAREHOUSE_MAX, warehouseFor } from "@/lib/work-location";
import { importPhone } from "@/lib/candidate-import";
import { addHelpSheet, addList, dropdown, issueMessages, newTemplate, readSheet, type RowIssue } from "@/lib/excel";
import type { EmploymentType, Gender } from "@/generated/prisma/enums";

// Bulk import of existing employees (Excel), e.g. when moving from spreadsheets.
// Sensitive data (NIK, NPWP, BPJS, salary, bank account) is not imported: HR fills
// it on each profile, where it is encrypted and every view is audited.

export const MAX_EMPLOYEE_ROWS = 500;
export const MAX_EMPLOYEE_IMPORT_BYTES = 2 * 1024 * 1024;

const SHEET = "Karyawan";

const columns = [
  // Old templates said "No. induk karyawan *"; still accepted so saved files keep working
  { key: "employeeNumber", header: "Employee ID *", width: 20, aliases: ["No. induk karyawan *"] },
  { key: "fullName", header: "Nama lengkap *", width: 28 },
  { key: "email", header: "Email *", width: 30 },
  { key: "phone", header: "No. HP / WhatsApp *", width: 20 },
  { key: "department", header: "Departemen *", width: 22 },
  { key: "position", header: "Jabatan *", width: 24 },
  // Added later and required: a file from an older template is refused with "Kolom tidak ditemukan"
  { key: "workLocation", header: "Lokasi *", width: 12 },
  { key: "warehouse", header: "Warehouse", width: 22 },
  { key: "employmentType", header: "Jenis karyawan *", width: 18 },
  { key: "status", header: "Status", width: 18 },
  { key: "joinDate", header: "Tanggal mulai *", width: 16 },
  { key: "endDate", header: "Tanggal berakhir", width: 16 },
  { key: "contractNumber", header: "No. kontrak", width: 22 },
  { key: "birthPlace", header: "Tempat lahir", width: 18 },
  { key: "birthDate", header: "Tanggal lahir", width: 16 },
  { key: "gender", header: "Jenis kelamin", width: 16 },
  // Added after the first template, so older files without these columns still import
  { key: "trainingStart", header: "Mulai training", width: 16, optional: true },
  { key: "trainingEnd", header: "Selesai training", width: 16, optional: true },
  { key: "motherMaidenName", header: "Nama ibu kandung", width: 24, optional: true },
] as const;

const COL = Object.fromEntries(columns.map((c, i) => [c.key, i + 1])) as Record<(typeof columns)[number]["key"], number>;

const statusLabels = { ACTIVE: "Aktif", PROBATION: "Masa percobaan" } as const;

// Label (or code) as typed in the sheet → enum value
function lookup<T extends string>(labels: Record<T, string>, value: string): T | undefined {
  const v = value.trim().toLowerCase();
  return (Object.keys(labels) as T[]).find((k) => k.toLowerCase() === v || labels[k].toLowerCase() === v);
}

// Excel date cells arrive as 2026-11-02; typed text may be 2/11/2026 or 02-11-2026
export function parseSheetDate(value: string): Date | null {
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  const iso = dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : value;
  const d = parseDateOnly(iso);
  // Rejects 31/02 and the like, which Date would roll over
  return d && d.toISOString().slice(0, 10) === iso ? d : null;
}

const requiredDate = (label: string) =>
  z.string().transform((v, ctx) => {
    const d = parseSheetDate(v);
    if (!d) {
      ctx.addIssue({ code: "custom", message: v ? `${label} tidak valid (format DD/MM/YYYY).` : `${label} wajib diisi.` });
      return z.NEVER;
    }
    return d;
  });

const optionalDate = (label: string) =>
  z.string().transform((v, ctx) => {
    if (!v) return undefined;
    const d = parseSheetDate(v);
    if (!d) {
      ctx.addIssue({ code: "custom", message: `${label} tidak valid (format DD/MM/YYYY).` });
      return z.NEVER;
    }
    return d;
  });

const enumField = <T extends string>(labels: Record<T, string>, error: string) =>
  z.string().transform((v, ctx) => {
    const found = lookup(labels, v);
    if (!found) {
      ctx.addIssue({ code: "custom", message: error });
      return z.NEVER;
    }
    return found;
  });

const optionalEnum = <T extends string>(labels: Record<T, string>, error: string) =>
  z.preprocess((v) => (v === "" ? undefined : v), enumField(labels, error).optional());

// Without this zod reports length errors in English ("Too big: …")
const maxLength = (max: number) => ({ error: `Maksimal ${max} karakter.` });

const optional = (max: number) =>
  z
    .string()
    .max(max, maxLength(max))
    .transform((v) => v || undefined);

const RowSchema = z
  .object({
    employeeNumber: z.string().min(1, { error: "Wajib diisi." }).max(30, maxLength(30)),
    fullName: z.string().min(3, { error: "Nama minimal 3 karakter." }).max(120, maxLength(120)),
    email: z.email({ error: "Email tidak valid." }).toLowerCase(),
    phone: importPhone,
    department: z.string().min(2, { error: "Wajib diisi." }).max(80, maxLength(80)),
    position: z.string().min(2, { error: "Wajib diisi." }).max(120, maxLength(120)),
    workLocation: z.string().transform((v, ctx) => {
      const found = parseWorkLocation(v);
      if (!found) {
        ctx.addIssue({ code: "custom", message: "Isi HO atau OPS." });
        return z.NEVER;
      }
      return found;
    }),
    warehouse: z.string().trim(),
    employmentType: enumField<EmploymentType>(employmentTypeLabel, `Pilih: ${Object.values(employmentTypeLabel).join(", ")}.`),
    status: optionalEnum(statusLabels, "Isi Aktif atau Masa percobaan (kosong = Aktif)."),
    joinDate: requiredDate("Tanggal mulai"),
    endDate: optionalDate("Tanggal berakhir"),
    contractNumber: optional(60),
    birthPlace: optional(80),
    birthDate: optionalDate("Tanggal lahir"),
    gender: optionalEnum<Gender>(genderLabel, "Isi Laki-laki atau Perempuan."),
    trainingStart: optionalDate("Mulai training"),
    trainingEnd: optionalDate("Selesai training"),
    motherMaidenName: optional(80),
  })
  .superRefine((d, ctx) => {
    // Checked only for OPS: for HO the column is ignored, so its length is too
    if (d.workLocation === "OPS" && !d.warehouse) {
      ctx.addIssue({ code: "custom", path: ["warehouse"], message: "Wajib diisi untuk lokasi OPS." });
    } else if (d.workLocation === "OPS" && d.warehouse.length > WAREHOUSE_MAX) {
      ctx.addIssue({ code: "custom", path: ["warehouse"], message: maxLength(WAREHOUSE_MAX).error });
    }
    if (d.employmentType === "PKWT" && !d.endDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "Kontrak PKWT wajib punya tanggal berakhir." });
    }
    if (d.endDate && d.joinDate && d.endDate <= d.joinDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "Harus setelah tanggal mulai." });
    }
    // UU 13/2003 Pasal 58: no probation in a PKWT
    if (d.employmentType === "PKWT" && d.status === "PROBATION") {
      ctx.addIssue({ code: "custom", path: ["status"], message: "Kontrak PKWT tidak boleh ada masa percobaan." });
    }
    const training = trainingErrors(
      { employeeNumber: d.employeeNumber, trainingStart: d.trainingStart ?? null, trainingEnd: d.trainingEnd ?? null },
      todayDate(),
    );
    for (const [path, messages] of Object.entries(training)) {
      for (const message of messages ?? []) ctx.addIssue({ code: "custom", path: [path], message });
    }
  });

// The contract number is filled in (<Employee ID>/IMPOR) when the sheet leaves it blank
export type EmployeeImportRow = Omit<z.output<typeof RowSchema>, "contractNumber" | "warehouse"> & {
  contractNumber: string;
  warehouse: string | null;
  rowNumber: number;
};

export async function buildEmployeeTemplate(): Promise<Buffer> {
  const { wb, sheet, lists } = newTemplate(SHEET, columns);
  const typeRange = addList(lists, 1, Object.values(employmentTypeLabel));
  const statusRange = addList(lists, 2, Object.values(statusLabels));
  const genderRange = addList(lists, 3, Object.values(genderLabel));
  const locationRange = addList(lists, 4, ["HO", "OPS"]);

  for (let r = 2; r <= MAX_EMPLOYEE_ROWS + 1; r++) {
    // Text format keeps leading zeros of phone, employee and contract numbers. Dates are
    // text too: as date cells, Excel on an English (US) laptop would read 01/02/2026 as 2 Jan.
    for (const key of ["employeeNumber", "phone", "contractNumber", "joinDate", "endDate", "birthDate", "trainingStart", "trainingEnd"] as const) {
      sheet.getCell(r, COL[key]).numFmt = "@";
    }
    sheet.getCell(r, COL.employmentType).dataValidation = dropdown(typeRange, "Pilih jenis karyawan dari daftar.");
    sheet.getCell(r, COL.status).dataValidation = dropdown(statusRange, "Pilih status dari daftar.");
    sheet.getCell(r, COL.gender).dataValidation = dropdown(genderRange, "Pilih jenis kelamin dari daftar.");
    sheet.getCell(r, COL.workLocation).dataValidation = dropdown(locationRange, "Pilih HO atau OPS.");
  }

  addHelpSheet(wb, [
    "Cara mengisi template import Karyawan",
    "",
    `1. Isi data di sheet "${SHEET}", mulai baris 2. Satu baris = satu karyawan. Maksimal ${MAX_EMPLOYEE_ROWS} baris. Jangan ubah judul kolom.`,
    "2. Kolom bertanda * wajib diisi.",
    "3. Departemen: ketik bebas. Departemen yang belum ada akan dibuat otomatis.",
    `4. Jenis karyawan: pilih dari dropdown (${Object.values(employmentTypeLabel).join(", ")}).`,
    "5. Status: Aktif atau Masa percobaan. Kosong = Aktif. Kontrak (PKWT) tidak boleh masa percobaan (UU 13/2003 Pasal 58).",
    "6. Tanggal ditulis DD/MM/YYYY (hari/bulan/tahun), misal 01/02/2026 = 1 Februari 2026. Kolom tanggal berformat teks agar Excel tidak mengubahnya. Tanggal berakhir wajib untuk Kontrak (PKWT).",
    "7. No. kontrak: kosongkan jika belum ada; akan diisi otomatis <Employee ID>/IMPOR.",
    "8. Employee ID yang sudah ada di Portal HR dilewati (tidak dobel), jadi file yang sama aman diunggah ulang.",
    "9. Jika ada baris yang salah, tidak ada data yang disimpan. Perbaiki baris yang disebutkan, lalu unggah lagi.",
    "10. NIK, NPWP, BPJS, gaji dan rekening TIDAK diisi di sini. Lengkapi dari profil karyawan (data itu disimpan terenkripsi).",
    "11. Training (penanda payroll): isi Mulai dan Selesai training, dan Employee ID harus berawalan T (misal T001). Sehari setelah Selesai training, huruf T dibuang otomatis (T001 menjadi 001). Kosongkan jika tidak training.",
    "12. Nama ibu kandung: untuk pendaftaran BPJS. Boleh dikosongkan dan dilengkapi nanti dari profil karyawan.",
    "13. Lokasi: HO (Head Office) atau OPS (Operational). Bila OPS, isi juga Warehouse (nama gudang, ketik bebas). Untuk HO, kolom Warehouse diabaikan.",
    "",
    "Contoh baris:",
    "K-0012 | Budi Santoso | budi@perusahaan.co.id | 081234567890 | Keuangan | Staf Akuntansi | HO | (kosong) | Kontrak (PKWT) | Aktif | 01/02/2026 | 31/01/2027 | 012/PKWT/II/2026 | Bandung | 15/08/1995 | Laki-laki",
    "K-0013 | Sari Dewi | sari@perusahaan.co.id | 081298765432 | Gudang | Admin Gudang | OPS | Gudang Cikarang | Tetap (PKWTT) | Aktif | 01/03/2026 | | | Bekasi | 02/05/1998 | Perempuan",
  ]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export type EmployeeParseResult =
  | { ok: true; rows: EmployeeImportRow[] }
  | { ok: false; message: string; issues?: RowIssue[] };

export async function parseEmployeeFile(data: Buffer): Promise<EmployeeParseResult> {
  const sheet = await readSheet(data, SHEET, columns, MAX_EMPLOYEE_ROWS);
  if (!sheet.ok) return sheet;

  const rows: EmployeeImportRow[] = [];
  const issues: RowIssue[] = [];
  // Values that must be unique within the file
  const seen = { employeeNumber: new Map<string, number>(), email: new Map<string, number>(), contractNumber: new Map<string, number>() };

  for (const { rowNumber, raw } of sheet.rows) {
    const parsed = RowSchema.safeParse(raw);
    if (!parsed.success) {
      issues.push({ rowNumber, name: raw.fullName || "(tanpa nama)", messages: issueMessages(columns, parsed.error.issues) });
      continue;
    }
    const d = parsed.data;
    const contractNumber = d.contractNumber ?? `${d.employeeNumber}/IMPOR`;
    const dupes: string[] = [];
    for (const [key, value, label] of [
      ["employeeNumber", d.employeeNumber.toLowerCase(), "Employee ID"],
      ["email", d.email, "Email"],
      ["contractNumber", contractNumber.toLowerCase(), "No. kontrak"],
    ] as const) {
      const first = seen[key].get(value);
      if (first) dupes.push(`${label}: sama dengan baris ${first}.`);
      else seen[key].set(value, rowNumber);
    }
    if (dupes.length) {
      issues.push({ rowNumber, name: d.fullName, messages: dupes });
      continue;
    }
    rows.push({ ...d, contractNumber, warehouse: warehouseFor(d.workLocation, d.warehouse), rowNumber });
  }

  if (issues.length) return { ok: false, message: `${issues.length} baris perlu diperbaiki. Belum ada data yang disimpan.`, issues };
  return { ok: true, rows };
}
