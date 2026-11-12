import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { NewEmployeeForm } from "./new-employee-form";

export const metadata: Metadata = { title: "Tambah karyawan" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

export default async function NewEmployeePage() {
  await requireRole("ADMIN", "HR");
  const departments = await db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link href="/dashboard/karyawan" className="text-sm text-brand-700 hover:underline">
          ← Semua karyawan
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Tambah karyawan</h1>
        <p className="mt-1 text-sm text-slate-600">
          Untuk karyawan yang tidak lewat rekrutmen di Portal HR, misal pindahan atau yang direkrut di luar sistem. Kandidat yang diterima
          dibuatkan datanya dari halaman kandidat; banyak karyawan sekaligus lewat Import dari Excel.
        </p>
      </div>
      {departments.length === 0 ? (
        <p className="card p-5 text-sm text-slate-600">
          Belum ada departemen. Departemen dibuat otomatis saat import karyawan dari Excel, atau saat membuat lowongan.
        </p>
      ) : (
        <NewEmployeeForm departments={departments} />
      )}
    </div>
  );
}
