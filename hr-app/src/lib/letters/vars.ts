import "server-only";
import { db } from "@/lib/db";
import { employmentTypeLabel, formatDateLong } from "@/lib/labels";
import type { LetterVars } from "./fill";
import { companyInfo } from "./service";

// Variables known before HR fills in the form. The form adds alasan, keperluan, gaji, etc.

export async function employeeLetterVars(employeeId: string): Promise<(LetterVars & { _name: string }) | null> {
  const e = await db.employee.findUnique({
    where: { id: employeeId },
    select: {
      fullName: true,
      employeeNumber: true,
      position: true,
      employmentType: true,
      joinDate: true,
      endDate: true,
      department: { select: { name: true } },
    },
  });
  if (!e) return null;
  const c = companyInfo();
  return {
    _name: e.fullName,
    nama: e.fullName,
    nomor_induk: e.employeeNumber,
    jabatan: e.position,
    departemen: e.department.name,
    status_kerja: employmentTypeLabel[e.employmentType],
    tanggal_mulai: formatDateLong(e.joinDate),
    tanggal_berakhir: e.endDate ? formatDateLong(e.endDate) : "",
    nama_perusahaan: c.name,
    kota: c.city,
  };
}

export async function offerLetterVars(applicationId: string): Promise<(LetterVars & { _name: string }) | null> {
  const a = await db.application.findUnique({
    where: { id: applicationId },
    select: {
      candidate: { select: { fullName: true, anonymizedAt: true } },
      job: { select: { title: true, location: true, employmentType: true, department: { select: { name: true } } } },
    },
  });
  if (!a || a.candidate.anonymizedAt) return null;
  const c = companyInfo();
  return {
    _name: a.candidate.fullName,
    nama: a.candidate.fullName,
    jabatan: a.job.title,
    departemen: a.job.department.name,
    status_kerja: employmentTypeLabel[a.job.employmentType],
    lokasi: a.job.location,
    nama_perusahaan: c.name,
    kota: c.city,
  };
}
