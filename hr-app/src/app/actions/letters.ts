"use server";

import { refresh } from "next/cache";
import * as z from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { failed, type FormState } from "@/lib/forms";
import { employmentTypeLabel, formatDateLong, formatRupiah, parseDateOnly } from "@/lib/labels";
import { fillTemplate, needsAcknowledgement, type LetterVars } from "@/lib/letters/fill";
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
  const template = await activeTemplate(input.type);
  const company = companyInfo();
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
      dateLine: dateLine(issuedAt),
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

const employeeTypes = ["SP1", "SP2", "SP3", "SURAT_KETERANGAN_KERJA", "PAKLARING"] as const;

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
]);

const SP_VALID_MONTHS = 6;

export async function issueEmployeeLetter(employeeId: string, _state: IssueState, formData: FormData): Promise<IssueState> {
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
  const user = await requireRole("ADMIN", "HR");
  if (!Object.values(LetterType).includes(type)) return { message: "Jenis surat tidak dikenal." };

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
