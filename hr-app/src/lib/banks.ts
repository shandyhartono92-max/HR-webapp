// Indonesian banks offered for payroll. Account-number lengths catch typos only;
// the inquiry (src/lib/banking.ts) is what confirms the account exists.

export const banks = {
  BCA: { name: "BCA", lengths: [10] },
  MANDIRI: { name: "Bank Mandiri", lengths: [13] },
  BRI: { name: "BRI", lengths: [15] },
  BNI: { name: "BNI", lengths: [10] },
  BSI: { name: "Bank Syariah Indonesia (BSI)", lengths: [10] },
  CIMB: { name: "CIMB Niaga", lengths: [12, 13, 14] },
  PERMATA: { name: "PermataBank", lengths: [10, 16] },
  DANAMON: { name: "Bank Danamon", lengths: [10, 12] },
  BTN: { name: "BTN", lengths: [16] },
  OCBC: { name: "OCBC", lengths: [12] },
  MAYBANK: { name: "Maybank Indonesia", lengths: [10, 11] },
  JAGO: { name: "Bank Jago", lengths: [12] },
  SEABANK: { name: "SeaBank", lengths: [12] },
  BJB: { name: "bank bjb", lengths: [13] },
  DKI: { name: "Bank DKI", lengths: [11] },
} as const;

export type BankCode = keyof typeof banks;
export const bankCodes = Object.keys(banks) as BankCode[];

export function accountNumberError(code: BankCode, digits: string): string | null {
  if (!/^\d+$/.test(digits)) return "Nomor rekening hanya boleh angka.";
  const { name, lengths } = banks[code];
  if (!(lengths as readonly number[]).includes(digits.length)) {
    return `Nomor rekening ${name} biasanya ${lengths.join(" atau ")} digit; yang diisi ${digits.length} digit.`;
  }
  return null;
}

// Compare names as banks print them: case, titles and punctuation vary
export function normalizeName(name: string) {
  return name
    .toUpperCase()
    .replace(/\b(IR|DR|DRS|DRA|H|HJ|SDR|SDRI|BPK|IBU|S\.?KOM|S\.?E|S\.?H|S\.?T)\b\.?/g, " ")
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
