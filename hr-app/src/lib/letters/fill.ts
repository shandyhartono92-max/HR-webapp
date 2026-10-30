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
  nama_perusahaan: "Nama perusahaan",
  kota: "Kota perusahaan",
};

// Letters that employees sign to acknowledge receipt
export const needsAcknowledgement = (type: LetterType) => type === "SP1" || type === "SP2" || type === "SP3";
