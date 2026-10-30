// Format checks for Indonesian identity numbers. These catch typos; they do not
// prove a number is registered (that needs Dukcapil / DJP / BPJS verification).

export const digitsOnly = (v: string) => v.replace(/\D/g, "");

type NikInfo = { birthDate: Date; gender: "L" | "P" };

// NIK (16 digits): PPKKCC DDMMYY SSSS. Women have 40 added to the day.
export function parseNik(nik: string, today = new Date()): NikInfo | null {
  if (!/^\d{16}$/.test(nik)) return null;
  let day = Number(nik.slice(6, 8));
  const month = Number(nik.slice(8, 10));
  const yy = Number(nik.slice(10, 12));
  const gender = day > 40 ? "P" : "L";
  if (day > 40) day -= 40;
  // Two-digit year: anything after this year's yy is the 1900s
  const year = yy <= today.getUTCFullYear() % 100 ? 2000 + yy : 1900 + yy;
  const birthDate = new Date(Date.UTC(year, month - 1, day));
  if (month < 1 || month > 12 || birthDate.getUTCDate() !== day || nik.startsWith("00")) return null;
  return { birthDate, gender };
}

export function nikError(nik: string, check?: { birthDate?: Date; gender?: "L" | "P" }): string | null {
  if (!/^\d{16}$/.test(nik)) return "NIK harus 16 digit angka.";
  const info = parseNik(nik);
  if (!info) return "NIK tidak valid: bagian tanggal lahir di NIK tidak masuk akal.";
  if (check?.birthDate && info.birthDate.getTime() !== check.birthDate.getTime()) {
    return "NIK tidak cocok dengan tanggal lahir. Periksa kembali NIK atau tanggal lahir.";
  }
  if (check?.gender && info.gender !== check.gender) {
    return "NIK tidak cocok dengan jenis kelamin. Periksa kembali NIK atau jenis kelamin.";
  }
  return null;
}

// NPWP: 15 digits (old format) or 16 digits (new format; for individuals it equals the NIK)
export function npwpError(npwp: string): string | null {
  return /^\d{15}$|^\d{16}$/.test(npwp) ? null : "NPWP harus 15 atau 16 digit angka.";
}

// Indonesian mobile number: 08…, 628… or +628…, 10–15 digits; separators allowed when typed
export const normalizePhone = (v: string) => v.replace(/[\s.()-]/g, "");
export const isIndonesianMobile = (v: string) => /^(\+62|62|0)8\d{7,12}$/.test(normalizePhone(v));

// BPJS Kesehatan card number: 13 digits
export function bpjsKesehatanError(no: string): string | null {
  return /^\d{13}$/.test(no) ? null : "Nomor BPJS Kesehatan harus 13 digit angka.";
}

// BPJS Ketenagakerjaan (KPJ) number: 11 digits
export function bpjsKetenagakerjaanError(no: string): string | null {
  return /^\d{11}$/.test(no) ? null : "Nomor BPJS Ketenagakerjaan (KPJ) harus 11 digit angka.";
}
