import "server-only";
import * as z from "zod";
import { isIndonesianMobile, normalizePhone } from "@/lib/indonesia-id";
import { educationLevels, manualSources } from "@/lib/labels";
import { addHelpSheet, addList, dropdown, issueMessages, newTemplate, readSheet, type RowIssue } from "@/lib/excel";

export type { RowIssue } from "@/lib/excel";

// Bulk import of candidates into the bank (Excel). HR fills the template made by
// buildImportTemplate(); parseImportFile() reads it back and checks every row.

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

const SHEET = "Kandidat";

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

// Source labels as shown in the template, mapped back to their stored keys
const sourceByLabel = new Map(Object.entries(manualSources).map(([key, label]) => [label.toLowerCase(), key]));
const sourceKeys = Object.keys(manualSources) as [keyof typeof manualSources, ...(keyof typeof manualSources)[]];

// Excel often drops the leading 0 of a number typed into a General cell
export const importPhone = z
  .string()
  .transform((v) => (/^8\d{7,12}$/.test(normalizePhone(v)) ? `0${normalizePhone(v)}` : normalizePhone(v)))
  .refine(isIndonesianMobile, { error: "Nomor HP Indonesia tidak valid (misal 0812xxxxxxx)." });

const RowSchema = z.object({
  fullName: z.string().min(3, { error: "Nama minimal 3 karakter." }).max(120),
  email: z.email({ error: "Email tidak valid." }).toLowerCase(),
  phone: importPhone,
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

export async function buildImportTemplate(): Promise<Buffer> {
  const { wb, sheet, lists } = newTemplate(SHEET, columns);
  const eduRange = addList(lists, 1, educationLevels);
  const sourceRange = addList(lists, 2, Object.values(manualSources));
  const yesNoRange = addList(lists, 3, ["Ya", "Tidak"]);

  for (let r = 2; r <= MAX_IMPORT_ROWS + 1; r++) {
    // Text format keeps the leading 0 of phone numbers
    sheet.getCell(r, 3).numFmt = "@";
    sheet.getCell(r, 5).dataValidation = dropdown(eduRange, "Pilih pendidikan dari daftar.");
    sheet.getCell(r, 6).dataValidation = dropdown(sourceRange, "Pilih sumber dari daftar.");
    sheet.getCell(r, 8).dataValidation = dropdown(yesNoRange, "Isi Ya atau Tidak.");
  }

  addHelpSheet(wb, [
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
  ]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export type ParseResult =
  | { ok: true; rows: ImportRow[] }
  | { ok: false; message: string; issues?: RowIssue[] };

export async function parseImportFile(data: Buffer): Promise<ParseResult> {
  const sheet = await readSheet(data, SHEET, columns, MAX_IMPORT_ROWS);
  if (!sheet.ok) return sheet;

  const rows: ImportRow[] = [];
  const issues: RowIssue[] = [];
  const seenEmails = new Map<string, number>();

  for (const { rowNumber, raw } of sheet.rows) {
    const parsed = RowSchema.safeParse(raw);
    if (!parsed.success) {
      issues.push({ rowNumber, name: raw.fullName || "(tanpa nama)", messages: issueMessages(columns, parsed.error.issues) });
      continue;
    }
    const firstRow = seenEmails.get(parsed.data.email);
    if (firstRow) {
      issues.push({ rowNumber, name: raw.fullName, messages: [`Email: sama dengan baris ${firstRow}.`] });
      continue;
    }
    seenEmails.set(parsed.data.email, rowNumber);
    rows.push({ ...parsed.data, rowNumber });
  }

  if (issues.length) return { ok: false, message: `${issues.length} baris perlu diperbaiki. Belum ada data yang disimpan.`, issues };
  return { ok: true, rows };
}
