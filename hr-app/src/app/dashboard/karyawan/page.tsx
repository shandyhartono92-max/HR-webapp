import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { employeeStatusLabel, employmentTypeLabel, formatDate } from "@/lib/labels";
import { contractAlert } from "@/lib/contracts";
import { AlertIcon, ContractAlertBadge } from "@/app/ui/contract-alert";
import { initials } from "@/lib/nav";
import { isInTraining } from "@/lib/training";
import { TrainingBadge } from "@/app/ui/training-badge";
import { nextSort, parseSort, sortEmployees, type Sort, type SortKey } from "@/lib/employee-sort";
import { locationText, parseLocationFilter } from "@/lib/work-location";
import type { WorkLocation } from "@/generated/prisma/enums";

// Columns hidden on phones; name and contract end stay (details are on the profile)
const WIDE = "hidden md:table-cell";

export const metadata: Metadata = { title: "Karyawan" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

export default async function EmployeesPage({ searchParams }: PageProps<"/dashboard/karyawan">) {
  await requireRole("ADMIN", "HR");
  const sp = await searchParams;
  const onlyEnding = sp.kontrak === "berakhir";
  const sort = parseSort(sp.urut, sp.arah);
  const location = parseLocationFilter(sp.lokasi);
  const view: ListView = { onlyEnding, sort, location };
  // Result of an import (set by importEmployees' redirect)
  const imported = typeof sp.impor === "string" && /^\d+$/.test(sp.impor) ? Number(sp.impor) : null;
  const skipped = typeof sp.lewati === "string" && /^\d+$/.test(sp.lewati) ? Number(sp.lewati) : 0;
  // Set by deleteEmployee's redirect
  const deleted = typeof sp.dihapus === "string" ? sp.dihapus.slice(0, 30) : null;

  // Non-sensitive columns only; NIK, NPWP, BPJS and salary never load here
  const all = await db.employee.findMany({
    orderBy: [{ status: "asc" }, { fullName: "asc" }],
    select: {
      id: true,
      employeeNumber: true,
      fullName: true,
      position: true,
      workLocation: true,
      warehouse: true,
      employmentType: true,
      status: true,
      joinDate: true,
      endDate: true,
      trainingEnd: true,
      traineeNumber: true,
      department: { select: { name: true } },
    },
  });
  const inPlace = location ? all.filter((e) => e.workLocation === location) : all;
  const withAlert = inPlace.map((e) => ({ ...e, alert: contractAlert(e.endDate, e.status) }));
  const ending = withAlert.filter((e) => e.alert.level);
  const overdue = ending.filter((e) => e.alert.level === "overdue").length;
  const shown = onlyEnding ? ending.sort((a, b) => a.alert.daysLeft! - b.alert.daysLeft!) : withAlert;
  const employees = sort ? sortEmployees(shown, sort) : shown;
  const header = (key: SortKey, label: string, className = "") => (
    <SortHeader key={key} column={key} label={label} view={view} className={className} />
  );

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
        <p role="status" className="rounded-md bg-brand-50 px-4 py-3 text-sm text-brand-800">
          {imported} karyawan berhasil di-import
          {skipped > 0 && `, ${skipped} dilewati karena Employee ID-nya sudah ada`}. Lengkapi NIK, NPWP, BPJS dan rekening dari profil
          masing-masing.
        </p>
      )}

      {deleted && (
        <p role="status" className="rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-800">
          Karyawan {deleted} sudah dihapus permanen. Penghapusan tercatat di log audit.
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
            href={listHref({ ...view, onlyEnding: !onlyEnding })}
            className="text-sm font-medium text-amber-900 underline"
          >
            {onlyEnding ? "Tampilkan semua karyawan" : "Lihat daftarnya"}
          </Link>
        </div>
      )}

      {all.length > 0 && <LocationFilter view={view} />}

      {employees.length === 0 ? (
        <p className="card p-5 text-sm text-slate-600">
          {all.length === 0 ? (
            "Belum ada data karyawan. Data dibuat dari halaman kandidat setelah kandidat diterima, atau di-import dari Excel."
          ) : (
            <>
              Tidak ada karyawan yang cocok dengan filter ini{location ? ` (lokasi ${location}${onlyEnding ? ", kontrak berakhir" : ""})` : ""}.{" "}
              <Link href="/dashboard/karyawan" className="font-medium text-brand-700 underline">
                Hapus filter
              </Link>
            </>
          )}
        </p>
      ) : (
        <div className="overflow-x-auto card">
          <table className="w-full text-left text-sm">
            <thead className="table-head border-b border-slate-200">
              <tr>
                {header("id", "Employee ID", WIDE)}
                {header("nama", "Nama")}
                {header("departemen", "Departemen", WIDE)}
                {header("jenis", "Jenis", WIDE)}
                {header("lokasi", "Lokasi", WIDE)}
                {header("status", "Status", WIDE)}
                {header("mulai", "Mulai", WIDE)}
                {header("berakhir", "Kontrak berakhir")}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((e) => (
                <tr key={e.id} className={e.alert.level === "overdue" ? "bg-red-50/50" : e.alert.level ? "bg-amber-50/50" : undefined}>
                  <td className={`${WIDE} px-4 py-3 font-mono text-xs text-slate-600`}>{e.employeeNumber}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-700 text-[11.5px] font-bold text-white"
                      >
                        {initials(e.fullName)}
                      </span>
                      <div className="min-w-0">
                        <Link href={`/dashboard/karyawan/${e.id}`} className="font-medium text-brand-800 hover:underline">
                          {e.fullName}
                        </Link>
                        <p className="text-xs text-slate-500">{e.position}</p>
                        {isInTraining(e) && (
                          <div className="mt-1">
                            <TrainingBadge end={e.trainingEnd!} />
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className={`${WIDE} px-4 py-3 text-slate-700`}>{e.department.name}</td>
                  <td className={`${WIDE} px-4 py-3 text-slate-700`}>{employmentTypeLabel[e.employmentType]}</td>
                  <td className={`${WIDE} px-4 py-3 text-slate-700`}>
                    {locationText(e.workLocation, e.warehouse) ?? <span className="text-xs text-amber-700">Belum diisi</span>}
                  </td>
                  <td className={`${WIDE} px-4 py-3`}>
                    <span
                      className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        e.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {employeeStatusLabel[e.status]}
                    </span>
                  </td>
                  <td className={`${WIDE} px-4 py-3 text-slate-600`}>{formatDate(e.joinDate)}</td>
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

// What the list shows: contract filter, location filter and column order
type ListView = { onlyEnding: boolean; sort: Sort | null; location: WorkLocation | null };

// The list's URL; each control keeps the other two, so they survive each other's links
function listHref({ onlyEnding, sort, location }: ListView) {
  const params = new URLSearchParams();
  if (onlyEnding) params.set("kontrak", "berakhir");
  if (location) params.set("lokasi", location.toLowerCase());
  if (sort) {
    params.set("urut", sort.key);
    params.set("arah", sort.dir);
  }
  const query = params.toString();
  return query ? `/dashboard/karyawan?${query}` : "/dashboard/karyawan";
}

const locationChoices: { value: WorkLocation | null; label: string }[] = [
  { value: null, label: "Semua lokasi" },
  { value: "HO", label: "HO" },
  { value: "OPS", label: "OPS" },
];

function LocationFilter({ view }: { view: ListView }) {
  return (
    <nav aria-label="Filter lokasi" className="flex flex-wrap items-center gap-2 text-sm">
      {locationChoices.map((c) => {
        const active = view.location === c.value;
        return (
          <Link
            key={c.label}
            href={listHref({ ...view, location: c.value })}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${
              active ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {c.label}
          </Link>
        );
      })}
    </nav>
  );
}

// A column header that sorts the list: first click A-Z, the next Z-A
function SortHeader({ column, label, view, className }: { column: SortKey; label: string; view: ListView; className: string }) {
  const { sort } = view;
  const active = sort?.key === column ? sort.dir : null;
  return (
    <th className={`${className} px-4 py-3 font-medium`} aria-sort={active ? (active === "az" ? "ascending" : "descending") : undefined}>
      <Link
        href={listHref({ ...view, sort: nextSort(sort, column) })}
        scroll={false}
        title={`Urutkan ${label} ${active === "az" ? "Z-A" : "A-Z"}`}
        className="group inline-flex items-center gap-1 whitespace-nowrap hover:text-brand-800"
      >
        {label}
        <span aria-hidden="true" className={active ? "text-brand-700" : "text-slate-300 group-hover:text-slate-500"}>
          {active === "az" ? "▲" : active === "za" ? "▼" : "↕"}
        </span>
      </Link>
    </th>
  );
}
