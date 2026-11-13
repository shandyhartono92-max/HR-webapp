import "server-only";
import { currentSite, siteDb } from "@/lib/db";
import { employmentTypeLabel, formatDateLong } from "@/lib/labels";
import type { LetterVars } from "./fill";
import { companyInfo } from "./service";

// Variables known before HR fills in the form. The form adds alasan, keperluan, gaji, etc.

export async function employeeLetterVars(employeeId: string): Promise<(LetterVars & { _name: string }) | null> {
  const db = await siteDb();
  const e = await db.employee.findUnique({
    where: { id: employeeId },
    select: {
      fullName: true,
      employeeNumber: true,
      position: true,
      employmentType: true,
      joinDate: true,
      endDate: true,
      address: true,
      department: { select: { name: true } },
      // The latest contract, for the contract-end notice
      contracts: { orderBy: { startDate: "desc" }, take: 1, select: { contractNumber: true, startDate: true } },
    },
  });
  if (!e) return null;
  const contract = e.contracts[0];
  const c = companyInfo(await currentSite());
  return {
    _name: e.fullName,
    nama: e.fullName,
    nomor_induk: e.employeeNumber,
    jabatan: e.position,
    departemen: e.department.name,
    status_kerja: employmentTypeLabel[e.employmentType],
    tanggal_mulai: formatDateLong(e.joinDate),
    tanggal_berakhir: e.endDate ? formatDateLong(e.endDate) : "",
    nomor_kontrak: contract?.contractNumber ?? "",
    kontrak_mulai: contract ? formatDateLong(contract.startDate) : "",
    alamat: e.address ?? "",
    nama_perusahaan: c.name,
    kota: c.city,
  };
}

export async function offerLetterVars(applicationId: string): Promise<(LetterVars & { _name: string }) | null> {
  const db = await siteDb();
  const a = await db.application.findUnique({
    where: { id: applicationId },
    select: {
      candidate: { select: { fullName: true, anonymizedAt: true } },
      job: { select: { title: true, location: true, employmentType: true, department: { select: { name: true } } } },
    },
  });
  if (!a || a.candidate.anonymizedAt) return null;
  const c = companyInfo(await currentSite());
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
