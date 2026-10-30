import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { daysUntil, employeeStatusLabel, employmentTypeLabel, formatDate } from "@/lib/labels";

export const metadata: Metadata = { title: "Karyawan" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

export default async function EmployeesPage() {
  await requireRole("ADMIN", "HR");

  // Non-sensitive columns only; NIK, NPWP, BPJS and salary never load here
  const employees = await db.employee.findMany({
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

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Karyawan</h1>

      {employees.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          Belum ada data karyawan. Data dibuat dari halaman kandidat setelah kandidat diterima.
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
              {employees.map((e) => {
                const daysLeft = e.endDate ? daysUntil(e.endDate) : null;
                const endingSoon = daysLeft !== null && daysLeft <= 30;
                return (
                  <tr key={e.id}>
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
                        <span className={endingSoon ? "font-medium text-amber-700" : "text-slate-600"}>
                          {formatDate(e.endDate)}
                          {endingSoon && (daysLeft! < 0 ? " (lewat)" : ` (${daysLeft} hari lagi)`)}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
