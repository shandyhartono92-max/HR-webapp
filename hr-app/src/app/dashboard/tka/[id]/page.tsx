import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { siteDb } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { todayDate } from "@/lib/labels";
import { foreignWorkerStatusLabel, kitasAlert } from "@/lib/foreign-workers";
import { ContractAlertBadge } from "@/app/ui/contract-alert";
import { ForeignWorkerForm, ForeignWorkerStatusButton } from "../foreign-worker-form";

export const metadata: Metadata = { title: "Data TKA" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function ForeignWorkerPage({ params }: PageProps<"/dashboard/tka/[id]">) {
  const db = await siteDb();
  await requireRole("ADMIN", "HR");
  const { id } = await params;
  const w = await db.foreignWorker.findUnique({ where: { id } });
  if (!w) notFound();
  const alert = kitasAlert(w.kitasExpiry, w.status, todayDate());
  const active = w.status === "ACTIVE";

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <Link href="/dashboard/tka" className="text-sm text-brand-700 hover:underline">
          ← Semua TKA
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{w.fullName}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}
          >
            Status: {foreignWorkerStatusLabel[w.status]}
          </span>
          <ContractAlertBadge level={alert.level} daysLeft={alert.daysLeft} />
        </div>
      </div>

      <section className="card space-y-3 p-5">
        <h2 className="font-medium text-slate-900">Ubah data</h2>
        <p className="text-xs text-slate-500">Setelah KITAS diperpanjang, isi nomor dan tanggal berlaku yang baru; peringatannya mulai dari awal lagi.</p>
        <ForeignWorkerForm
          id={w.id}
          initial={{
            fullName: w.fullName,
            passportNumber: w.passportNumber,
            kitasNumber: w.kitasNumber,
            passportExpiry: iso(w.passportExpiry),
            kitasExpiry: iso(w.kitasExpiry),
            location: w.location,
          }}
        />
      </section>

      <section className="card space-y-2 p-5">
        <h2 className="font-medium text-slate-900">Status</h2>
        <p className="text-sm text-slate-600">
          {active
            ? "Jadikan Non Aktif bila TKA ini sudah pulang atau tidak melanjutkan. Datanya tetap tersimpan, tanpa peringatan KITAS."
            : "TKA ini Non Aktif dan tidak memunculkan peringatan. Aktifkan lagi bila ia kembali bekerja."}
        </p>
        <ForeignWorkerStatusButton id={w.id} active={active} />
      </section>
    </div>
  );
}
