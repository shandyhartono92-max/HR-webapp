import * as z from "zod";
import { optionalDate, optionalText } from "@/lib/forms";
import { parseDateOnly } from "@/lib/labels";
import { trainingErrors } from "@/lib/training";
import { endedContractError } from "@/lib/contract-end";
import { warehouseError, warehouseFor, workLocationFields } from "@/lib/work-location";
import {
  bpjsKesehatanError,
  bpjsKetenagakerjaanError,
  digitsOnly,
  isIndonesianMobile,
  nikError,
  normalizePhone,
  npwpError,
} from "@/lib/indonesia-id";
import { EmploymentType, Gender, PtkpStatus, WorkLocation } from "@/generated/prisma/enums";

// The manual "Tambah karyawan" form: one employee who did not come through
// recruitment. Its rules are the ones the Excel import, the hire form and the
// personal-data form already apply, so every road gives the same record.

// Never sent back to the browser, not even to refill the form after an error
export const SENSITIVE_FIELDS = ["nik", "npwp", "bpjsKesehatan", "bpjsKetenagakerjaan"] as const;

const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);
const optionalEnum = <T extends Record<string, string>>(values: T) => z.preprocess(blankToUndefined, z.enum(values).optional());
const sensitive = z.preprocess(
  (v) => (typeof v === "string" ? digitsOnly(v) : ""),
  z.string().transform((v) => v || undefined),
);

const Form = z.object({
  employeeNumber: z.string().trim().min(1, { error: "Isi Employee ID." }).max(30, { error: "Maksimal 30 karakter." }),
  contractNumber: optionalText(60),
  fullName: z.string().trim().min(3, { error: "Nama minimal 3 karakter." }).max(120, { error: "Maksimal 120 karakter." }),
  email: z.email({ error: "Email tidak valid." }).trim().toLowerCase(),
  phone: z.string().refine(isIndonesianMobile, { error: "Masukkan nomor HP Indonesia, misal 0812xxxxxxx." }).transform(normalizePhone),
  departmentId: z.string().min(1, { error: "Pilih departemen." }),
  position: z.string().trim().min(2, { error: "Isi jabatan." }).max(120, { error: "Maksimal 120 karakter." }),
  workLocation: z.preprocess(blankToUndefined, z.enum(WorkLocation, { error: "Pilih lokasi kerja: HO atau OPS." })),
  warehouse: workLocationFields.warehouse,
  employmentType: z.preprocess(blankToUndefined, z.enum(EmploymentType, { error: "Pilih jenis hubungan kerja." })),
  // A new employee has not left yet
  status: z.enum(["ACTIVE", "PROBATION"], { error: "Pilih Aktif atau Masa percobaan." }),
  joinDate: z.string().transform((v, ctx) => parseDateOnly(v) ?? (ctx.addIssue({ code: "custom", message: "Isi tanggal mulai bekerja." }), z.NEVER)),
  endDate: optionalDate,
  trainingStart: optionalDate,
  trainingEnd: optionalDate,
  birthPlace: optionalText(80),
  birthDate: optionalDate,
  gender: optionalEnum(Gender),
  address: optionalText(500),
  motherMaidenName: optionalText(80),
  ptkpStatus: optionalEnum(PtkpStatus),
  nik: sensitive,
  npwp: sensitive,
  bpjsKesehatan: sensitive,
  bpjsKetenagakerjaan: sensitive,
});

type Errors = Record<string, string[]>;

export type NewEmployee = Omit<z.output<typeof Form>, "contractNumber" | "warehouse" | "birthPlace" | "gender" | "address" | "motherMaidenName" | "ptkpStatus"> & {
  contractNumber: string;
  // True when the form left it blank and it was filled in as <Employee ID>/MANUAL
  contractNumberAuto: boolean;
  warehouse: string | null;
  birthPlace: string | null;
  gender: Gender | null;
  address: string | null;
  motherMaidenName: string | null;
  ptkpStatus: PtkpStatus | null;
};

// Field errors first; the rules between fields (contract, location, training, NIK)
// run once every field on its own is valid
export function parseNewEmployee(input: Record<string, unknown>, today: Date): { ok: true; data: NewEmployee } | { ok: false; errors: Errors } {
  const parsed = Form.safeParse(input);
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors as Errors };
  const d = parsed.data;

  const errors: Errors = {};
  const add = (key: string, message: string) => (errors[key] ??= []).push(message);

  if (d.employmentType === "PKWT" && !d.endDate) add("endDate", "Kontrak PKWT wajib punya tanggal berakhir.");
  if (d.endDate && d.endDate <= d.joinDate) add("endDate", "Tanggal berakhir harus setelah tanggal mulai.");
  else {
    const ended = endedContractError(d.endDate, today);
    if (ended) add("endDate", ended);
  }
  // UU 13/2003 Pasal 58: no probation in a PKWT
  if (d.employmentType === "PKWT" && d.status === "PROBATION") add("status", "Kontrak PKWT tidak boleh ada masa percobaan.");

  const warehouse = warehouseError(d.workLocation, d.warehouse);
  if (warehouse) add("warehouse", warehouse);

  for (const [key, messages] of Object.entries(trainingErrors(d, today))) for (const m of messages ?? []) add(key, m);

  const checks = [
    ["nik", d.nik && nikError(d.nik, { birthDate: d.birthDate ?? undefined, gender: d.gender })],
    ["npwp", d.npwp && npwpError(d.npwp)],
    ["bpjsKesehatan", d.bpjsKesehatan && bpjsKesehatanError(d.bpjsKesehatan)],
    ["bpjsKetenagakerjaan", d.bpjsKetenagakerjaan && bpjsKetenagakerjaanError(d.bpjsKetenagakerjaan)],
  ] as const;
  for (const [key, message] of checks) if (message) add(key, message);

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      ...d,
      contractNumber: d.contractNumber ?? `${d.employeeNumber}/MANUAL`,
      contractNumberAuto: !d.contractNumber,
      warehouse: warehouseFor(d.workLocation, d.warehouse),
      birthPlace: d.birthPlace ?? null,
      gender: d.gender ?? null,
      address: d.address ?? null,
      motherMaidenName: d.motherMaidenName ?? null,
      ptkpStatus: d.ptkpStatus ?? null,
    },
  };
}
