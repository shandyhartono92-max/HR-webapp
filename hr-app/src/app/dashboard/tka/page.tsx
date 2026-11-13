import type { Metadata } from "next";
import Link from "next/link";
import { siteDb } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { formatDate, todayDate } from "@/lib/labels";
import { foreignWorkerStatusLabel, kitasAlert, type ForeignWorkerStatus } from "@/lib/foreign-workers";
import { AlertIcon, ContractAlertBadge } from "@/app/ui/contract-alert";

export const metadata: Metadata = { title: "Tenaga Kerja Asing" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

// ?status=aktif (default) | nonaktif | semua; ?kitas=habis shows only the KITAS alerts
const statusFilters = [
  { key: "aktif", label: "Aktif" },
  { key: "nonaktif", label: "Non Aktif" },
  { key: "semua", label: "Semua" },
] as const;
type StatusKey = (typeof statusFilters)[number]["key"];
const statusWhere: Record<StatusKey, ForeignWorkerStatus | undefined> = { aktif: "ACTIVE", nonaktif: "INACTIVE", semua: undefined };

export default async function ForeignWorkersPage({ searchParams }: PageProps<"/dashboard/tka">) {
  const db = await siteDb();
  await requireRole("ADMIN", "HR");
  const sp = await searchParams;
  const status: StatusKey = statusFilters.some((f) => f.key === sp.status) ? (sp.status as StatusKey) : "aktif";
  const onlyAlerts = sp.kitas === "habis";
  const added = sp.ditambah === "1";
  const today = todayDate();

  const all = await db.foreignWorker.findMany({
    orderBy: [{ kitasExpiry: "asc" }, { fullName: "asc" }],
    select: { id: true, fullName: true, passportNumber: true, kitasNumber: true, passportExpiry: true, kitasExpiry: true, location: true, status: true },
  });
  const withAlert = all.map((w) => ({ ...w, alert: kitasAlert(w.kitasExpiry, w.status, today) }));
  // The banner counts every active worker's KITAS, whatever filter is picked
  const alerted = withAlert.filter((w) => w.alert.level);
  const overdue = alerted.filter((w) => w.alert.level === "overdue").length;
  const wanted = statusWhere[status];
  const rows = (onlyAlerts ? alerted : withAlert).filter((w) => !wanted || w.status === wanted);
  const href = (s: StatusKey) => (s === "aktif" ? "/dashboard/tka" : `/dashboard/tka?status=${s}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Tenaga Kerja Asing</h1>
          <p className="mt-1 text-sm text-slate-600">Paspor dan KITAS TKA. Peringatan muncul 30 hari sebelum KITAS habis.</p>
        </div>
        <Link href="/dashboard/tka/tambah" className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
          Tambah TKA
        </Link>
      </div>

      {added && (
        <p role="status" className="rounded-md bg-brand-50 px-4 py-3 text-sm text-brand-800">
          TKA ditambahkan.
        </p>
      )}

      {alerted.length > 0 && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="flex items-center gap-2 text-sm text-amber-900">
            <AlertIcon className="size-5 shrink-0 text-amber-600" />
            <span>
              <strong>{alerted.length} KITAS</strong> habis dalam 30 hari
              {overdue > 0 && (
                <>
                  , termasuk <strong className="text-red-700">{overdue} yang sudah lewat</strong>
                </>
              )}
              . Perbarui tanggalnya setelah diperpanjang, atau jadikan Non Aktif bila TKA sudah pulang.
            </span>
          </p>
          <Link href={onlyAlerts ? "/dashboard/tka" : "/dashboard/tka?kitas=habis"} className="text-sm font-medium text-amber-900 underline">
            {onlyAlerts ? "Tampilkan semua TKA aktif" : "Lihat daftarnya"}
          </Link>
        </div>
      )}

      <nav aria-label="Filter status" className="flex flex-wrap gap-2 text-sm">
        {statusFilters.map((f) => {
          const active = !onlyAlerts && f.key === status;
          return (
            <Link
              key={f.key}
              href={href(f.key)}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3 py-1 ${
                active ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="card p-5 text-sm text-slate-600">
          {all.length === 0 ? "Belum ada data TKA. Klik Tambah TKA untuk mulai." : "Tidak ada TKA dengan filter ini."}
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="table-head border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Paspor</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">KITAS</th>
                <th className="px-4 py-3 font-medium">KITAS berlaku</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((w) => (
                <tr key={w.id} className={w.alert.level === "overdue" ? "bg-red-50/50" : w.alert.level ? "bg-amber-50/50" : undefined}>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/tka/${w.id}`} className="font-medium text-brand-800 hover:underline">
                      {w.fullName}
                    </Link>
                    <p className="text-xs text-slate-500">{w.location}</p>
                    {/* The Status column is hidden on phones; show Non Aktif here instead */}
                    {w.status === "INACTIVE" && (
                      <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 md:hidden">
                        Non Aktif
                      </span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <p className="font-mono text-xs text-slate-700">{w.passportNumber}</p>
                    <p className="text-xs text-slate-500">s/d {formatDate(w.passportExpiry)}</p>
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs text-slate-700 md:table-cell">{w.kitasNumber}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <p className="text-slate-600">{formatDate(w.kitasExpiry)}</p>
                      <ContractAlertBadge level={w.alert.level} daysLeft={w.alert.daysLeft} />
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <span
                      className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        w.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {foreignWorkerStatusLabel[w.status]}
                    </span>
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
