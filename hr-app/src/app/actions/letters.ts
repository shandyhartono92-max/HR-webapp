"use server";

import { refresh } from "next/cache";
import * as z from "zod";
import { currentSite, siteDb } from "@/lib/db";
import { formSiteRefusal } from "@/lib/form-site";
import { requireRole } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { checkbox, failed, optionalInt, optionalText, type FormState } from "@/lib/forms";
import {
  employeeStatusLabel,
  employmentTypeLabel,
  formatDateLong,
  formatDayDateLong,
  formatRupiah,
  parseDateOnly,
  todayDate,
} from "@/lib/labels";
import { findOrCreateDepartment } from "@/lib/departments";
import {
  changeLetterTypes,
  fillTemplate,
  isChangeLetter,
  needsAcknowledgement,
  SALARY_UNCHANGED_TEXT,
  summonsRounds,
  type ChangeLetterType,
  type LetterVars,
} from "@/lib/letters/fill";
import { renderLetterPdf } from "@/lib/letters/pdf";
import { activeTemplate, companyInfo, dateLine, formatLetterNumber, nextSequence } from "@/lib/letters/service";
import { employeeLetterVars, offerLetterVars } from "@/lib/letters/vars";
import { deleteFile, saveFile } from "@/lib/storage";
import { Prisma } from "@/generated/prisma/client";
import { EmploymentType, LetterType } from "@/generated/prisma/enums";

export type IssueState = (NonNullable<FormState> & { letterId?: string; letterNumber?: string }) | undefined;

const dateField = (error: string) =>
  z.string().transform((v, ctx) => {
    const d = parseDateOnly(v);
    if (!d) {
      ctx.addIssue({ code: "custom", message: error });
      return z.NEVER;
    }
    return d;
  });

type IssueInput = {
  type: LetterType;
  vars: LetterVars;
  recipientName: string;
  employeeId?: string;
  applicationId?: string;
  reason?: string;
  validUntil?: Date;
  issuedById: string;
};

// Numbers the letter, renders the PDF, stores it and records the Letter row.
// The running number is unique; if two letters race for it, the loser retries.
async function issue(input: IssueInput) {
  const db = await siteDb();
  const template = await activeTemplate(input.type);
  const site = await currentSite();
  const company = companyInfo(site);
  const issuedAt = new Date();

  for (let attempt = 0; attempt < 5; attempt++) {
    const seq = (await nextSequence(input.type, issuedAt)) + attempt;
    const letterNumber = formatLetterNumber(input.type, seq, issuedAt);
    const vars = { ...input.vars, nomor_surat: letterNumber, tanggal_surat: formatDateLong(issuedAt) };

    const pdf = await renderLetterPdf({
      company: { name: company.name, address: company.address, city: company.city },
      title: template.name,
      letterNumber,
      body: fillTemplate(template.body, vars),
      dateLine: dateLine(issuedAt, site),
      signatory: { name: company.signatoryName, title: company.signatoryTitle },
      acknowledgementName: needsAcknowledgement(input.type) ? input.recipientName : undefined,
    });
    const fileKey = await saveFile("letters", pdf, "pdf");

    try {
      const letter = await db.letter.create({
        data: {
          type: input.type,
          letterNumber,
          templateId: template.id,
          employeeId: input.employeeId,
          applicationId: input.applicationId,
          recipientName: input.recipientName,
          reason: input.reason,
          validUntil: input.validUntil,
          issuedAt,
          issuedById: input.issuedById,
          fileKey,
          signatureStatus: needsAcknowledgement(input.type) ? "PENDING" : "NOT_REQUIRED",
        },
        select: { id: true },
      });
      await writeAudit({
        actorId: input.issuedById,
        action: "letter.issued",
        entityType: "Letter",
        entityId: letter.id,
        changes: { type: input.type, letterNumber, templateVersion: template.version },
      });
      return { letterId: letter.id, letterNumber };
    } catch (e) {
      await deleteFile(fileKey);
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new Error("Could not allocate a letter number");
}

// ── Letters to employees ────────────────────────────────────

const employeeTypes = ["SP1", "SP2", "SP3", "SURAT_KETERANGAN_KERJA", "PAKLARING", ...changeLetterTypes, "BERAKHIR_KONTRAK", "PANGGILAN"] as const;

const EmployeeLetterSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["SP1", "SP2", "SP3"]),
    reason: z.string().trim().min(20, { error: "Uraikan pelanggaran minimal 20 karakter." }).max(3000),
  }),
  z.object({
    type: z.literal("SURAT_KETERANGAN_KERJA"),
    purpose: z.string().trim().min(3, { error: "Isi keperluan, misal: pengajuan KPR." }).max(200),
  }),
  z.object({
    type: z.literal("PAKLARING"),
    lastDay: dateField("Isi tanggal terakhir bekerja."),
  }),
  z.object({
    type: z.enum(changeLetterTypes),
    newPosition: z.string().trim().min(2, { error: "Isi jabatan baru." }).max(120),
    newDepartment: z.string().trim().min(2, { error: "Isi departemen baru." }).max(80),
    newLocation: optionalText(120),
    effectiveDate: dateField("Isi tanggal berlaku."),
    reason: z.string().trim().min(10, { error: "Tulis pertimbangan minimal 10 karakter." }).max(3000),
    newSalary: optionalInt(0, 1_000_000_000, "Isi angka tanpa titik, misal 8500000."),
    applyChange: checkbox,
  }),
  // Everything comes from the employee's latest contract
  z.object({ type: z.literal("BERAKHIR_KONTRAK") }),
  z.object({
    type: z.literal("PANGGILAN"),
    summonsRound: z.enum(summonsRounds, { error: "Pilih panggilan pertama atau kedua." }),
    absentSince: dateField("Isi tanggal mulai tidak masuk."),
    meetDate: dateField("Isi tanggal menghadap."),
    meetTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, { error: "Isi jam menghadap." }),
    meetPlace: z.string().trim().min(3, { error: "Isi tempat menghadap, misal: Ruang HRD Lt. 2." }).max(150, { error: "Maksimal 150 karakter." }),
    // Where the letter is sent: the KTP address by default, or where they actually live
    recipientAddress: z
      .string()
      .trim()
      .min(10, { error: "Isi alamat tujuan surat secara lengkap." })
      .max(500, { error: "Maksimal 500 karakter." }),
  }),
]);

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Mutasi names the (new) work location; promosi/demosi must change the position
function changeLetterErrors(
  type: ChangeLetterType,
  d: { newPosition: string; newLocation?: string; reason: string },
  current: { jabatan: string },
): Record<string, string[]> | null {
  if (type === "MUTASI") {
    return d.newLocation ? null : { newLocation: ["Isi lokasi kerja baru, misal: Kantor Cabang Surabaya."] };
  }
  if (same(d.newPosition, current.jabatan)) return { newPosition: ["Jabatan baru harus berbeda dari jabatan sekarang."] };
  if (type === "DEMOSI" && d.reason.length < 20) return { reason: ["Uraikan dasar demosi minimal 20 karakter (hasil evaluasi, SP terkait)."] };
  return null;
}

const SP_VALID_MONTHS = 6;

// Contract-end notices and summons only make sense while someone still works here
async function notWorking(employeeId: string): Promise<string | null> {
  const db = await siteDb();
  const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { status: true } });
  if (!emp) return "Data karyawan tidak ditemukan.";
  return emp.status === "ACTIVE" || emp.status === "PROBATION"
    ? null
    : `Karyawan ini berstatus ${employeeStatusLabel[emp.status]}. Surat ini hanya untuk karyawan yang masih bekerja.`;
}

export async function issueEmployeeLetter(employeeId: string, _state: IssueState, formData: FormData): Promise<IssueState> {
  const db = await siteDb();
  const user = await requireRole("ADMIN", "HR");

  const raw = Object.fromEntries(formData);
  if (!employeeTypes.includes(raw.type as (typeof employeeTypes)[number])) return failed(formData, { type: ["Pilih jenis surat."] });
  const parsed = EmployeeLetterSchema.safeParse(raw);
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);
  const data = parsed.data;

  const vars = await employeeLetterVars(employeeId);
  if (!vars) return { message: "Data karyawan tidak ditemukan." };

  let reason: string | undefined;
  let validUntil: Date | undefined;
  switch (data.type) {
    case "SP1":
    case "SP2":
    case "SP3": {
      const until = new Date();
      until.setMonth(until.getMonth() + SP_VALID_MONTHS);
      validUntil = parseDateOnly(until.toISOString().slice(0, 10))!;
      reason = data.reason;
      vars.alasan = data.reason;
      vars.berlaku_hingga = formatDateLong(validUntil);
      break;
    }
    case "SURAT_KETERANGAN_KERJA":
      vars.keperluan = data.purpose;
      break;
    case "PAKLARING":
      vars.tanggal_berakhir = formatDateLong(data.lastDay);
      break;
    case "MUTASI":
    case "PROMOSI":
    case "DEMOSI": {
      const errors = changeLetterErrors(data.type, data, { jabatan: vars.jabatan });
      if (errors) return failed(formData, errors);
      reason = data.reason;
      Object.assign(vars, {
        alasan: data.reason,
        jabatan_baru: data.newPosition,
        departemen_baru: data.newDepartment,
        lokasi_baru: data.newLocation ?? "",
        tanggal_efektif: formatDateLong(data.effectiveDate),
        // The new salary lives only inside the stored PDF, like the offer letter
        gaji_baru: data.newSalary ? `${formatRupiah(data.newSalary)} per bulan` : SALARY_UNCHANGED_TEXT,
      });
      break;
    }
    case "BERAKHIR_KONTRAK": {
      const blocked = await notWorking(employeeId);
      if (blocked) return failed(formData, undefined, blocked);
      const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { endDate: true } });
      if (!emp?.endDate) {
        return failed(formData, undefined, "Karyawan ini tidak punya tanggal berakhir kontrak. Surat ini hanya untuk kontrak PKWT.");
      }
      // The letter says the contract "akan berakhir": only before (or on) that day
      if (emp.endDate < todayDate()) {
        return failed(
          formData,
          undefined,
          `Kontrak karyawan ini sudah berakhir pada ${formatDateLong(emp.endDate)}. Surat pemberitahuan dibuat sebelum kontrak berakhir.`,
        );
      }
      break;
    }
    case "PANGGILAN": {
      const blocked = await notWorking(employeeId);
      if (blocked) return failed(formData, undefined, blocked);
      const today = todayDate();
      const errors: Record<string, string[]> = {};
      if (data.absentSince > today) errors.absentSince = ["Tanggal tidak masuk tidak boleh di masa depan."];
      if (data.meetDate < today) errors.meetDate = ["Tanggal menghadap tidak boleh sebelum hari ini."];
      else if (data.meetDate <= data.absentSince) errors.meetDate = ["Tanggal menghadap harus setelah tanggal mulai tidak masuk."];
      if (Object.keys(errors).length) return failed(formData, errors);
      Object.assign(vars, {
        alamat: data.recipientAddress,
        panggilan_ke: data.summonsRound,
        tidak_masuk_sejak: formatDateLong(data.absentSince),
        tanggal_menghadap: formatDayDateLong(data.meetDate),
        jam_menghadap: data.meetTime.replace(":", "."),
        tempat_menghadap: data.meetPlace,
      });
      reason = `Panggilan ${data.summonsRound}, tidak masuk sejak ${formatDateLong(data.absentSince)}`;
      break;
    }
  }

  const result = await issue({
    type: data.type,
    vars,
    recipientName: vars._name,
    employeeId,
    reason,
    validUntil,
    issuedById: user.id,
  });

  // Optionally carry the new position and department into the employee record
  if (isChangeLetter(data.type) && "applyChange" in data && data.applyChange) {
    const before = await db.employee.findUnique({ where: { id: employeeId }, select: { position: true, departmentId: true } });
    const dept = await findOrCreateDepartment(data.newDepartment);
    const after = { position: data.newPosition, departmentId: dept.id };
    await db.employee.update({ where: { id: employeeId }, data: after });
    await writeAudit({
      actorId: user.id,
      action: "employee.employment_updated",
      entityType: "Employee",
      entityId: employeeId,
      changes: { via: result.letterNumber, position: { from: before?.position, to: after.position }, departmentId: { from: before?.departmentId, to: after.departmentId } },
    });
  }
  refresh();
  return { ok: true, ...result, attempt: Date.now() };
}

// ── Offer letter to a candidate ─────────────────────────────

const OfferSchema = z
  .object({
    salary: z.coerce.number({ error: "Isi gaji pokok." }).int().min(1, { error: "Isi gaji pokok." }).max(1_000_000_000),
    startDate: dateField("Isi tanggal mulai bekerja."),
    confirmBy: dateField("Isi batas konfirmasi."),
    location: z.string().trim().min(2, { error: "Isi lokasi kerja." }).max(120),
    employmentType: z.enum(EmploymentType),
  })
  .refine((d) => d.confirmBy < d.startDate, { path: ["confirmBy"], error: "Batas konfirmasi harus sebelum tanggal mulai." });

export async function issueOfferLetter(applicationId: string, _state: IssueState, formData: FormData): Promise<IssueState> {
  const db = await siteDb();
  const user = await requireRole("ADMIN", "HR");

  const app = await db.application.findUnique({ where: { id: applicationId }, select: { stage: true } });
  if (!app) return { message: "Lamaran tidak ditemukan." };
  if (app.stage !== "OFFER") return { message: "Pindahkan kandidat ke tahap Penawaran terlebih dahulu." };

  const parsed = OfferSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);
  const d = parsed.data;

  const vars = await offerLetterVars(applicationId);
  if (!vars) return { message: "Lamaran tidak ditemukan." };
  Object.assign(vars, {
    gaji: formatRupiah(d.salary),
    tanggal_mulai: formatDateLong(d.startDate),
    batas_konfirmasi: formatDateLong(d.confirmBy),
    lokasi: d.location,
    status_kerja: employmentTypeLabel[d.employmentType],
  });

  // The salary lives only inside the stored PDF, not in a database column
  const result = await issue({
    type: "OFFER_LETTER",
    vars,
    recipientName: vars._name,
    applicationId,
    issuedById: user.id,
  });
  refresh();
  return { ok: true, ...result, attempt: Date.now() };
}

// ── Template editing (new version on every save) ────────────

const TemplateSchema = z.object({
  name: z.string().trim().min(3, { error: "Isi judul surat." }).max(120),
  body: z.string().trim().min(30, { error: "Isi surat terlalu pendek." }).max(20_000),
});

export async function saveTemplate(type: LetterType, _state: FormState, formData: FormData): Promise<FormState> {
  const db = await siteDb();
  const user = await requireRole("ADMIN", "HR");
  if (!Object.values(LetterType).includes(type)) return { message: "Jenis surat tidak dikenal." };
  const moved = await formSiteRefusal(formData);
  if (moved) return { message: moved, attempt: Date.now() };

  const parsed = TemplateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(formData, z.flattenError(parsed.error).fieldErrors);

  const current = await activeTemplate(type);
  if (current.name === parsed.data.name && current.body === parsed.data.body.replace(/\r\n/g, "\n")) {
    return { ok: true, message: undefined, attempt: Date.now() };
  }

  // Old versions stay, so letters already issued keep pointing at the text they were made from
  const created = await db.$transaction(async (tx) => {
    await tx.letterTemplate.updateMany({ where: { type, isActive: true }, data: { isActive: false } });
    return tx.letterTemplate.create({
      data: { type, name: parsed.data.name, body: parsed.data.body.replace(/\r\n/g, "\n"), version: current.version + 1 },
      select: { id: true, version: true },
    });
  });
  await writeAudit({
    actorId: user.id,
    action: "letter_template.updated",
    entityType: "LetterTemplate",
    entityId: created.id,
    changes: { type, version: created.version },
  });
  refresh();
  return { ok: true, attempt: Date.now() };
}
