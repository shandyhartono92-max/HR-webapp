import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { employeeStatusLabel, employmentTypeLabel, formatDate } from "@/lib/labels";
import { contractAlert } from "@/lib/contracts";
import { AlertIcon, ContractAlertBadge } from "@/app/ui/contract-alert";

export const metadata: Metadata = { title: "Karyawan" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

export default async function EmployeesPage({ searchParams }: PageProps<"/dashboard/karyawan">) {
  await requireRole("ADMIN", "HR");
  const sp = await searchParams;
  const onlyEnding = sp.kontrak === "berakhir";
  // Result of an import (set by importEmployees' redirect)
  const imported = typeof sp.impor === "string" && /^\d+$/.test(sp.impor) ? Number(sp.impor) : null;
  const skipped = typeof sp.lewati === "string" && /^\d+$/.test(sp.lewati) ? Number(sp.lewati) : 0;

  // Non-sensitive columns only; NIK, NPWP, BPJS and salary never load here
  const all = await db.employee.findMany({
    orderBy: [{ status: "asc" }, { fullName: "asc" }],
    select: {
      id: true,
      employeeNumber: true,
      fullName: true,
      position: true,
      employmentType: true,
      status: true,
      joinDate: true,
      endDate: true,
      department: { select: { name: true } },
    },
  });
  const withAlert = all.map((e) => ({ ...e, alert: contractAlert(e.endDate, e.status) }));
  const ending = withAlert.filter((e) => e.alert.level);
  const overdue = ending.filter((e) => e.alert.level === "overdue").length;
  const employees = onlyEnding ? ending.sort((a, b) => a.alert.daysLeft! - b.alert.daysLeft!) : withAlert;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Karyawan</h1>
        <Link
          href="/dashboard/karyawan/import"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Import dari Excel
        </Link>
      </div>

      {imported !== null && (
        <p role="status" className="rounded-md bg-teal-50 px-4 py-3 text-sm text-teal-800">
          {imported} karyawan berhasil di-import
          {skipped > 0 && `, ${skipped} dilewati karena no. induknya sudah ada`}. Lengkapi NIK, NPWP, BPJS dan rekening dari profil
          masing-masing.
        </p>
      )}

      {ending.length > 0 && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="flex items-center gap-2 text-sm text-amber-900">
            <AlertIcon className="size-5 shrink-0 text-amber-600" />
            <span>
              <strong>{ending.length} kontrak</strong> berakhir dalam 6 minggu
              {overdue > 0 && (
                <>
                  , termasuk <strong className="text-red-700">{overdue} yang sudah lewat</strong>
                </>
              )}
              . Buka profil karyawan untuk memperpanjang kontrak atau mengubah statusnya.
            </span>
          </p>
          <Link
            href={onlyEnding ? "/dashboard/karyawan" : "/dashboard/karyawan?kontrak=berakhir"}
            className="text-sm font-medium text-amber-900 underline"
          >
            {onlyEnding ? "Tampilkan semua karyawan" : "Lihat daftarnya"}
          </Link>
        </div>
      )}

      {employees.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          Belum ada data karyawan. Data dibuat dari halaman kandidat setelah kandidat diterima, atau di-import dari Excel.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">No. induk</th>
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Departemen</th>
                <th className="px-4 py-3 font-medium">Jenis</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Mulai</th>
                <th className="px-4 py-3 font-medium">Kontrak berakhir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((e) => (
                <tr key={e.id} className={e.alert.level === "overdue" ? "bg-red-50/50" : e.alert.level ? "bg-amber-50/50" : undefined}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{e.employeeNumber}</td>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/karyawan/${e.id}`} className="font-medium text-teal-800 hover:underline">
                      {e.fullName}
                    </Link>
                    <p className="text-xs text-slate-500">{e.position}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{e.department.name}</td>
                  <td className="px-4 py-3 text-slate-700">{employmentTypeLabel[e.employmentType]}</td>
                  <td className="px-4 py-3 text-slate-700">{employeeStatusLabel[e.status]}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(e.joinDate)}</td>
                  <td className="px-4 py-3">
                    {e.endDate ? (
                      <div className="space-y-1">
                        <p className="text-slate-600">{formatDate(e.endDate)}</p>
                        <ContractAlertBadge {...e.alert} />
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
