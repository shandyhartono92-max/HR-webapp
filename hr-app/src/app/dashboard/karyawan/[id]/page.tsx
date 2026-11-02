import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import {
  employeeStatusLabel,
  employmentTypeLabel,
  formatDate,
  genderLabel,
  letterTypeLabel,
  ptkpLabel,
} from "@/lib/labels";
import { contractAlert } from "@/lib/contracts";
import { AlertIcon, ContractAlertBadge } from "@/app/ui/contract-alert";
import { activeTemplate } from "@/lib/letters/service";
import { employeeLetterVars } from "@/lib/letters/vars";
import type { LetterType } from "@/generated/prisma/enums";
import { EmployeeLetterForm, type TemplateView } from "../../surat/letter-forms";
import { EmployeeLoginPanel, EmploymentForm, PersonalForm, SensitiveValue } from "./employee-forms";

const employeeLetterTypes: LetterType[] = ["SP1", "SP2", "SP3", "SURAT_KETERANGAN_KERJA", "PAKLARING"];

export const metadata: Metadata = { title: "Detail karyawan" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[11rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900">{children}</dd>
    </div>
  );
}

export default async function EmployeeDetailPage({ params }: PageProps<"/dashboard/karyawan/[id]">) {
  await requireRole("ADMIN", "HR");
  const { id } = await params;

  // Select explicitly: the *Enc columns never leave the server
  const [emp, departments, managers] = await Promise.all([
    db.employee.findUnique({
      where: { id },
      select: {
        id: true,
        employeeNumber: true,
        fullName: true,
        email: true,
        phone: true,
        position: true,
        employmentType: true,
        status: true,
        joinDate: true,
        endDate: true,
        departmentId: true,
        managerId: true,
        applicationId: true,
        department: { select: { name: true } },
        manager: { select: { fullName: true } },
        user: { select: { email: true, mustChangePassword: true, lastLoginAt: true } },
        bankAccounts: {
          where: { isActive: true },
          select: { bankName: true, accountNumberLast4: true, accountHolderName: true, effectiveFrom: true },
        },
        birthPlace: true,
        birthDate: true,
        gender: true,
        address: true,
        ptkpStatus: true,
        nikKtpLast4: true,
        npwpLast4: true,
        bpjsKesehatanLast4: true,
        bpjsKetenagakerjaanLast4: true,
        contracts: {
          orderBy: { startDate: "desc" },
          select: { id: true, contractNumber: true, type: true, position: true, startDate: true, endDate: true },
        },
        letters: {
          orderBy: { issuedAt: "desc" },
          select: { id: true, letterNumber: true, type: true, issuedAt: true, validUntil: true },
        },
      },
    }),
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.employee.findMany({
      where: { id: { not: id }, status: { in: ["ACTIVE", "PROBATION"] } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);
  if (!emp) notFound();

  // Sequential on purpose: the local dev database handles one connection at a time
  const templates: Partial<Record<LetterType, TemplateView>> = {};
  for (const t of employeeLetterTypes) {
    const tpl = await activeTemplate(t);
    templates[t] = { name: tpl.name, body: tpl.body };
  }
  const letterVars = Object.fromEntries(
    Object.entries((await employeeLetterVars(emp.id))!).filter(([k]) => k !== "_name"),
  );
  const latestActiveSp = emp.letters.find(
    (l) => (l.type === "SP1" || l.type === "SP2" || l.type === "SP3") && l.validUntil && l.validUntil >= new Date(),
  );

  const alert = contractAlert(emp.endDate, emp.status);

  const last4 = {
    nik: emp.nikKtpLast4,
    npwp: emp.npwpLast4,
    bpjsKesehatan: emp.bpjsKesehatanLast4,
    bpjsKetenagakerjaan: emp.bpjsKetenagakerjaanLast4,
  };
  const missing = [
    !emp.nikKtpLast4 && "NIK",
    !emp.npwpLast4 && "NPWP",
    !emp.bpjsKesehatanLast4 && "BPJS Kesehatan",
    !emp.bpjsKetenagakerjaanLast4 && "BPJS Ketenagakerjaan",
    !emp.ptkpStatus && "status PTKP",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/karyawan" className="text-sm text-teal-700 hover:underline">
          ← Semua karyawan
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">{emp.fullName}</h1>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
            {employeeStatusLabel[emp.status]}
          </span>
          <ContractAlertBadge {...alert} />
        </div>
        <p className="text-sm text-slate-500">
          {emp.employeeNumber} · {emp.position} · {emp.department.name}
        </p>
        {alert.level && (
          <p
            role="alert"
            className={`mt-3 flex items-center gap-2 rounded-md px-4 py-3 text-sm ${
              alert.level === "overdue" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"
            }`}
          >
            <AlertIcon className="size-5 shrink-0" />
            {alert.level === "overdue"
              ? `Kontrak sudah berakhir ${formatDate(emp.endDate!)}, tetapi status masih ${employeeStatusLabel[emp.status]}. Perpanjang kontrak atau ubah statusnya.`
              : `Kontrak berakhir ${formatDate(emp.endDate!)}. Putuskan perpanjangan atau pengakhiran sebelum tanggal itu.`}
          </p>
        )}
        {missing.length > 0 && (
          <p className="mt-3 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Data belum lengkap: {missing.join(", ")}. Dibutuhkan untuk pendaftaran BPJS dan perhitungan PPh 21.
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-medium text-slate-900">Data pribadi</h2>
            <dl className="mt-2 divide-y divide-slate-100">
              <Row label="Tempat, tanggal lahir">
                {[emp.birthPlace, emp.birthDate && formatDate(emp.birthDate)].filter(Boolean).join(", ") || "-"}
              </Row>
              <Row label="Jenis kelamin">{emp.gender ? genderLabel[emp.gender] : "-"}</Row>
              <Row label="Status PTKP">{emp.ptkpStatus ? ptkpLabel[emp.ptkpStatus] : "-"}</Row>
              <Row label="Alamat">{emp.address ?? "-"}</Row>
              <Row label="NIK">
                <SensitiveValue employeeId={emp.id} field="nik" last4={last4.nik} />
              </Row>
              <Row label="NPWP">
                <SensitiveValue employeeId={emp.id} field="npwp" last4={last4.npwp} />
              </Row>
              <Row label="BPJS Kesehatan">
                <SensitiveValue employeeId={emp.id} field="bpjsKesehatan" last4={last4.bpjsKesehatan} />
              </Row>
              <Row label="BPJS Ketenagakerjaan">
                <SensitiveValue employeeId={emp.id} field="bpjsKetenagakerjaan" last4={last4.bpjsKetenagakerjaan} />
              </Row>
            </dl>
            <p className="mt-2 text-xs text-slate-500">Setiap kali nomor lengkap dilihat, tercatat di log audit.</p>

            <details className="mt-4 border-t border-slate-100 pt-4">
              <summary className="cursor-pointer text-sm font-medium text-teal-800">Ubah data pribadi</summary>
              <div className="mt-3">
                <PersonalForm
                  employeeId={emp.id}
                  last4={last4}
                  initial={{
                    birthPlace: emp.birthPlace ?? "",
                    birthDate: isoDate(emp.birthDate),
                    gender: emp.gender ?? "",
                    address: emp.address ?? "",
                    ptkpStatus: emp.ptkpStatus ?? "",
                  }}
                />
              </div>
            </details>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-medium text-slate-900">Surat</h2>
            {emp.letters.length > 0 && (
              <ul className="mt-3 divide-y divide-slate-100">
                {emp.letters.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <span className="font-medium text-slate-900">{letterTypeLabel[l.type]}</span>
                      <span className="text-slate-500"> · {l.letterNumber} · {formatDate(l.issuedAt)}</span>
                      {l.validUntil && <span className="text-slate-500"> · berlaku s.d. {formatDate(l.validUntil)}</span>}
                    </span>
                    <a href={`/dashboard/surat/${l.id}/pdf`} target="_blank" className="text-teal-700 hover:underline">
                      PDF
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <details className="mt-4 border-t border-slate-100 pt-4" open={emp.letters.length === 0}>
              <summary className="cursor-pointer text-sm font-medium text-teal-800">Buat surat</summary>
              <div className="mt-3">
                <EmployeeLetterForm
                  employeeId={emp.id}
                  templates={templates}
                  vars={letterVars}
                  defaultLastDay={isoDate(emp.endDate)}
                  activeWarning={
                    latestActiveSp
                      ? { type: latestActiveSp.type, validUntil: formatDate(latestActiveSp.validUntil!) }
                      : null
                  }
                />
              </div>
            </details>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-medium text-slate-900">Riwayat kontrak</h2>
            {emp.contracts.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">Belum ada kontrak.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {emp.contracts.map((c) => (
                  <li key={c.id} className="py-2 text-sm">
                    <p className="font-medium text-slate-900">
                      {c.contractNumber} · {employmentTypeLabel[c.type]}
                    </p>
                    <p className="text-slate-600">
                      {c.position} · {formatDate(c.startDate)} – {c.endDate ? formatDate(c.endDate) : "tidak terbatas"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-medium text-slate-900">Kepegawaian</h2>
            <dl className="mt-2 divide-y divide-slate-100">
              <Row label="Jenis">{employmentTypeLabel[emp.employmentType]}</Row>
              <Row label="Mulai bekerja">{formatDate(emp.joinDate)}</Row>
              <Row label="Kontrak berakhir">{emp.endDate ? formatDate(emp.endDate) : "-"}</Row>
              <Row label="Atasan">{emp.manager?.fullName ?? "-"}</Row>
              <Row label="Email">{emp.email}</Row>
              <Row label="Telepon">{emp.phone}</Row>
            </dl>
            {emp.applicationId && (
              <Link href={`/dashboard/kandidat/${emp.applicationId}`} className="mt-2 inline-block text-sm text-teal-700 hover:underline">
                Lihat data rekrutmen
              </Link>
            )}
            <div className="mt-4 border-t border-slate-100 pt-4">
              <h3 className="mb-2 text-sm font-medium text-slate-900">Akun login</h3>
              <EmployeeLoginPanel
                employeeId={emp.id}
                login={
                  emp.user
                    ? {
                        email: emp.user.email,
                        mustChangePassword: emp.user.mustChangePassword,
                        lastLoginAt: emp.user.lastLoginAt ? formatDate(emp.user.lastLoginAt) : null,
                      }
                    : null
                }
              />
            </div>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <h3 className="mb-2 text-sm font-medium text-slate-900">Rekening gaji</h3>
              {emp.bankAccounts[0] ? (
                <div className="text-sm text-slate-700">
                  <p>
                    {emp.bankAccounts[0].bankName} · <SensitiveValue employeeId={emp.id} field="bankAccount" last4={emp.bankAccounts[0].accountNumberLast4} />
                  </p>
                  <p className="text-xs text-slate-500">
                    a.n. {emp.bankAccounts[0].accountHolderName} · berlaku sejak {formatDate(emp.bankAccounts[0].effectiveFrom)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-600">Belum ada rekening aktif. Karyawan mengajukannya sendiri lewat menu Rekening Gaji.</p>
              )}
            </div>
            <details className="mt-4 border-t border-slate-100 pt-4">
              <summary className="cursor-pointer text-sm font-medium text-teal-800">Ubah data kepegawaian</summary>
              <div className="mt-3">
                <EmploymentForm
                  employeeId={emp.id}
                  departments={departments}
                  managers={managers.map((m) => ({ id: m.id, name: m.fullName }))}
                  initial={{
                    departmentId: emp.departmentId,
                    position: emp.position,
                    status: emp.status,
                    managerId: emp.managerId ?? "",
                  }}
                />
              </div>
            </details>
          </section>
        </div>
      </div>
    </div>
  );
}
