// Template filling shared by the server (PDF) and the browser (live preview).
// Placeholders look like {{nama}}. Unknown or empty ones render as "[nama]" so
// a missing value is visible in the preview instead of silently blank.

import type { LetterType } from "@/generated/prisma/enums";

export type LetterVars = Record<string, string>;

export function fillTemplate(body: string, vars: LetterVars): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key: string) => vars[key]?.trim() || `[${key}]`);
}

export function missingPlaceholders(body: string, vars: LetterVars): string[] {
  const keys = [...body.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]);
  return [...new Set(keys.filter((k) => !vars[k]?.trim()))];
}

// Placeholders available in every template, with a short description for the template editor
export const placeholderHelp: Record<string, string> = {
  nama: "Nama penerima",
  nomor_induk: "Nomor induk karyawan",
  jabatan: "Jabatan / posisi",
  departemen: "Departemen",
  status_kerja: "PKWT / PKWTT / Magang",
  tanggal_mulai: "Tanggal mulai bekerja",
  tanggal_berakhir: "Tanggal terakhir bekerja (Paklaring)",
  tanggal_surat: "Tanggal surat",
  nomor_surat: "Nomor surat",
  alasan: "Alasan / uraian pelanggaran (SP)",
  berlaku_hingga: "Masa berlaku SP",
  keperluan: "Keperluan surat keterangan",
  gaji: "Gaji pokok (surat penawaran)",
  lokasi: "Lokasi kerja (surat penawaran)",
  batas_konfirmasi: "Batas konfirmasi (surat penawaran)",
  jabatan_baru: "Jabatan baru (mutasi / promosi / demosi)",
  departemen_baru: "Departemen baru (mutasi / promosi / demosi)",
  lokasi_baru: "Lokasi kerja baru (mutasi)",
  tanggal_efektif: "Tanggal berlaku (mutasi / promosi / demosi)",
  gaji_baru: "Gaji pokok baru, atau “sesuai ketentuan” bila kosong",
  nama_perusahaan: "Nama perusahaan",
  kota: "Kota perusahaan",
};

// Letters that employees sign to acknowledge receipt
export const needsAcknowledgement = (type: LetterType) =>
  type === "SP1" || type === "SP2" || type === "SP3" || type === "MUTASI" || type === "PROMOSI" || type === "DEMOSI";

// Changes of position, department or location ("SK"), issued from the employee page
export const changeLetterTypes = ["MUTASI", "PROMOSI", "DEMOSI"] as const;
export type ChangeLetterType = (typeof changeLetterTypes)[number];
export const isChangeLetter = (type: string): type is ChangeLetterType => (changeLetterTypes as readonly string[]).includes(type);

// Shown when HR leaves the new salary blank
export const SALARY_UNCHANGED_TEXT = "Sesuai ketentuan perusahaan yang berlaku";
