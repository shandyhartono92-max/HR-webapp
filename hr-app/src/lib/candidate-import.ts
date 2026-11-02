import "server-only";
import ExcelJS from "exceljs";
import * as z from "zod";
import { isIndonesianMobile, normalizePhone } from "@/lib/indonesia-id";
import { educationLevels, manualSources } from "@/lib/labels";

// Bulk import of candidates into the bank (Excel). HR fills the template made by
// buildImportTemplate(); parseImportFile() reads it back and checks every row.

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

const SHEET = "Kandidat";
const YES = "Ya";
const NO = "Tidak";

// Header text in the template; the order is the column order
const columns = [
  { key: "fullName", header: "Nama lengkap *", width: 28 },
  { key: "email", header: "Email *", width: 30 },
  { key: "phone", header: "No. HP / WhatsApp *", width: 20 },
  { key: "city", header: "Kota domisili", width: 18 },
  { key: "lastEducation", header: "Pendidikan terakhir *", width: 20 },
  { key: "source", header: "Sumber *", width: 26 },
  { key: "consentEvidence", header: "Bukti persetujuan *", width: 44 },
  { key: "talentPool", header: "Talent pool (Ya/Tidak)", width: 22 },
] as const;

type ColumnKey = (typeof columns)[number]["key"];

// Source labels as shown in the template, mapped back to their stored keys
const sourceByLabel = new Map(Object.entries(manualSources).map(([key, label]) => [label.toLowerCase(), key]));
const sourceKeys = Object.keys(manualSources) as [keyof typeof manualSources, ...(keyof typeof manualSources)[]];

const RowSchema = z.object({
  fullName: z.string().min(3, { error: "Nama minimal 3 karakter." }).max(120),
  email: z.email({ error: "Email tidak valid." }).toLowerCase(),
  phone: z
    .string()
    // Excel often drops the leading 0 of a number typed into a General cell
    .transform((v) => (/^8\d{7,12}$/.test(normalizePhone(v)) ? `0${normalizePhone(v)}` : normalizePhone(v)))
    .refine(isIndonesianMobile, { error: "Nomor HP Indonesia tidak valid (misal 0812xxxxxxx)." }),
  city: z
    .string()
    .max(80)
    .transform((v) => v || undefined),
  lastEducation: z.enum(educationLevels, { error: `Pendidikan harus salah satu: ${educationLevels.join(", ")}.` }),
  source: z.preprocess(
    (v) => sourceByLabel.get(String(v).toLowerCase()) ?? v,
    z.enum(sourceKeys, { error: "Sumber tidak dikenal. Pilih dari daftar di template." }),
  ),
  consentEvidence: z
    .string()
    .min(5, { error: "Bukti persetujuan wajib diisi (misal: setuju via email 30 Okt 2026)." })
    .max(300),
  talentPool: z
    .string()
    .transform((v) => v.toLowerCase())
    .refine((v) => ["", "ya", "tidak"].includes(v), { error: "Isi Ya atau Tidak." })
    .transform((v) => v === "ya"),
});

export type ImportRow = z.infer<typeof RowSchema> & { rowNumber: number };
export type RowIssue = { rowNumber: number; name: string; messages: string[] };

export async function buildImportTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Portal HR";

  const sheet = wb.addWorksheet(SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };

  // Lists for the dropdowns live on a hidden sheet, so the labels can contain commas
  const lists = wb.addWorksheet("Daftar", { state: "veryHidden" });
  educationLevels.forEach((v, i) => (lists.getCell(i + 1, 1).value = v));
  Object.values(manualSources).forEach((v, i) => (lists.getCell(i + 1, 2).value = v));
  [YES, NO].forEach((v, i) => (lists.getCell(i + 1, 3).value = v));

  const sourceCount = Object.keys(manualSources).length;
  for (let r = 2; r <= MAX_IMPORT_ROWS + 1; r++) {
    // Text format keeps the leading 0 of phone numbers
    sheet.getCell(r, 3).numFmt = "@";
    sheet.getCell(r, 5).dataValidation = list(`Daftar!$A$1:$A$${educationLevels.length}`, "Pilih pendidikan dari daftar.");
    sheet.getCell(r, 6).dataValidation = list(`Daftar!$B$1:$B$${sourceCount}`, "Pilih sumber dari daftar.");
    sheet.getCell(r, 8).dataValidation = list("Daftar!$C$1:$C$2", "Isi Ya atau Tidak.");
  }

  const help = wb.addWorksheet("Petunjuk");
  help.getColumn(1).width = 110;
  const lines = [
    "Cara mengisi template import Bank Kandidat",
    "",
    `1. Isi data di sheet "${SHEET}", mulai baris 2. Satu baris = satu kandidat. Maksimal ${MAX_IMPORT_ROWS} baris. Jangan ubah judul kolom.`,
    "2. Kolom bertanda * wajib diisi.",
    `3. Pendidikan terakhir: pilih dari dropdown (${educationLevels.join(", ")}).`,
    `4. Sumber: pilih dari dropdown (${Object.values(manualSources).join("; ")}).`,
    "5. Talent pool: Ya = disimpan hingga 2 tahun; Tidak atau kosong = 6 bulan. Isi Ya hanya jika kandidat setuju.",
    "6. Bukti persetujuan (UU PDP): kapan dan lewat apa kandidat setuju datanya disimpan, misal: setuju via email 30 Okt 2026.",
    "   Jangan memasukkan kandidat yang belum setuju. Kirimkan tautan /karir/privasi saat meminta persetujuan.",
    "7. Email yang sudah ada di Bank Kandidat akan dilewati (tidak dobel).",
    "8. Jika ada baris yang salah, tidak ada data yang disimpan. Perbaiki baris yang disebutkan, lalu unggah lagi.",
    "9. CV tidak ikut di-import. Unggah CV dari halaman profil kandidat sebelum memasukkannya ke lowongan.",
    "",
    "Contoh baris:",
    "Siti Rahma | siti.rahma@email.com | 081234567890 | Bandung | S1 | CV via email | setuju via email 30 Okt 2026 | Ya",
  ];
  lines.forEach((text, i) => (help.getCell(i + 1, 1).value = text));
  help.getRow(1).font = { bold: true, size: 13 };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function list(formula: string, error: string): ExcelJS.DataValidation {
  return { type: "list", allowBlank: true, formulae: [formula], showErrorMessage: true, errorTitle: "Isian tidak valid", error };
}

// Plain text of a cell, whatever Excel stored (number, hyperlink, rich text, formula)
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((p) => p.text).join("").trim();
    if ("text" in value) return cellText(value.text as ExcelJS.CellValue);
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    return "";
  }
  return String(value).trim();
}

export type ParseResult =
  | { ok: true; rows: ImportRow[] }
  | { ok: false; message: string; issues?: RowIssue[] };

export async function parseImportFile(data: Buffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as unknown as ArrayBuffer);
  } catch {
    return { ok: false, message: "File tidak bisa dibaca. Gunakan template Excel (.xlsx) dari halaman ini." };
  }
  const sheet = wb.getWorksheet(SHEET) ?? wb.worksheets[0];
  if (!sheet) return { ok: false, message: "File tidak berisi sheet." };

  // Find columns by header text, so a moved column still works
  const index = new Map<ColumnKey, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    const text = cellText(cell.value).toLowerCase();
    const match = columns.find((c) => c.header.toLowerCase() === text);
    if (match) index.set(match.key, col);
  });
  const missing = columns.filter((c) => !index.has(c.key)).map((c) => `"${c.header}"`);
  if (missing.length) {
    return { ok: false, message: `Kolom tidak ditemukan: ${missing.join(", ")}. Gunakan template dari halaman ini.` };
  }

  const rows: ImportRow[] = [];
  const issues: RowIssue[] = [];
  const seenEmails = new Map<string, number>();

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const raw = Object.fromEntries(columns.map((c) => [c.key, cellText(row.getCell(index.get(c.key)!).value)])) as Record<ColumnKey, string>;
    if (Object.values(raw).every((v) => v === "")) continue;

    if (rows.length + issues.length >= MAX_IMPORT_ROWS) {
      return { ok: false, message: `Maksimal ${MAX_IMPORT_ROWS} kandidat per file. Bagi menjadi beberapa file.` };
    }

    const parsed = RowSchema.safeParse(raw);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((i) => {
        const col = columns.find((c) => c.key === i.path[0]);
        return `${col ? col.header.replace(" *", "") : "Baris"}: ${i.message}`;
      });
      issues.push({ rowNumber: r, name: raw.fullName || "(tanpa nama)", messages });
      continue;
    }

    const firstRow = seenEmails.get(parsed.data.email);
    if (firstRow) {
      issues.push({ rowNumber: r, name: raw.fullName, messages: [`Email: sama dengan baris ${firstRow}.`] });
      continue;
    }
    seenEmails.set(parsed.data.email, r);
    rows.push({ ...parsed.data, rowNumber: r });
  }

  if (issues.length) {
    return { ok: false, message: `${issues.length} baris perlu diperbaiki. Belum ada data yang disimpan.`, issues };
  }
  if (rows.length === 0) return { ok: false, message: "Tidak ada data kandidat di file." };
  return { ok: true, rows };
}
