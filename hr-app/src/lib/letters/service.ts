import "server-only";
import { siteDb } from "@/lib/db";
import { formatDateLong } from "@/lib/labels";
import { Prisma } from "@/generated/prisma/client";
import type { LetterType } from "@/generated/prisma/enums";
import { defaultTemplates } from "./defaults";

// Company details printed on every letter. Set these in .env.
export function companyInfo() {
  return {
    name: process.env.COMPANY_NAME || "[Nama Perusahaan]",
    address: process.env.COMPANY_ADDRESS || "[Alamat perusahaan, kota, kode pos · telepon · email]",
    city: process.env.COMPANY_CITY || "[Kota]",
    signatoryName: process.env.LETTER_SIGNATORY_NAME || "[Nama Penandatangan]",
    signatoryTitle: process.env.LETTER_SIGNATORY_TITLE || "[Jabatan Penandatangan]",
  };
}

// The active template for a type; creates version 1 from the defaults on first use
export async function activeTemplate(type: LetterType) {
  const db = await siteDb();
  const existing = await db.letterTemplate.findFirst({
    where: { type, isActive: true },
    orderBy: { version: "desc" },
    select: { id: true, name: true, body: true, version: true },
  });
  if (existing) return existing;
  const d = defaultTemplates[type];
  try {
    return await db.letterTemplate.create({
      data: { type, name: d.name, body: d.body, version: 1 },
      select: { id: true, name: true, body: true, version: true },
    });
  } catch (e) {
    // Another request created it at the same moment
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return activeTemplate(type);
    throw e;
  }
}

const typeCode: Record<LetterType, string> = {
  SP1: "SP1",
  SP2: "SP2",
  SP3: "SP3",
  SURAT_KETERANGAN_KERJA: "SKK",
  PAKLARING: "PKL",
  MUTASI: "SK-MUT",
  PROMOSI: "SK-PRO",
  DEMOSI: "SK-DEM",
  BERAKHIR_KONTRAK: "PBK",
  PANGGILAN: "SPG",
  OFFER_LETTER: "OL",
  OTHER: "LAIN",
};
const ROMAN_MONTHS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

// "007/HR/SP1/XI/2026": running number per letter type per year, Roman-numeral month.
// Change the layout with LETTER_NUMBER_FORMAT, e.g. "{seq}/PT-ABC/{kode}/{bulan}/{tahun}".
export function formatLetterNumber(type: LetterType, seq: number, date: Date) {
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const format = process.env.LETTER_NUMBER_FORMAT || "{seq}/HR/{kode}/{bulan}/{tahun}";
  return format
    .replace("{seq}", String(seq).padStart(3, "0"))
    .replace("{kode}", typeCode[type])
    .replace("{bulan}", ROMAN_MONTHS[wib.getUTCMonth()])
    .replace("{tahun}", String(wib.getUTCFullYear()));
}

export async function nextSequence(type: LetterType, date: Date) {
  const db = await siteDb();
  const year = new Date(date.getTime() + 7 * 60 * 60 * 1000).getUTCFullYear();
  // Year boundaries in WIB
  const start = new Date(Date.UTC(year, 0, 1) - 7 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(year + 1, 0, 1) - 7 * 60 * 60 * 1000);
  const count = await db.letter.count({ where: { type, issuedAt: { gte: start, lt: end } } });
  return count + 1;
}

export const dateLine = (date: Date) => `${companyInfo().city}, ${formatDateLong(date)}`;
