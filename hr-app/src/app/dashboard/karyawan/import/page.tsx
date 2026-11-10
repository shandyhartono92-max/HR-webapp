import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/dal";
import { MAX_EMPLOYEE_ROWS } from "@/lib/employee-import";
import { ImportEmployeesForm } from "./import-form";

export const metadata: Metadata = { title: "Import karyawan" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

export default async function ImportEmployeesPage() {
  await requireRole("ADMIN", "HR");

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link href="/dashboard/karyawan" className="text-sm text-brand-700 hover:underline">
          ← Semua karyawan
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Import karyawan dari Excel</h1>
        <p className="mt-1 text-sm text-slate-600">Untuk memindahkan data karyawan yang sudah ada, misal dari spreadsheet lama.</p>
      </div>

      <section className="space-y-3 card p-5 text-sm text-slate-700">
        <h2 className="font-medium text-slate-900">1. Unduh dan isi template</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Satu baris satu karyawan, maksimal {MAX_EMPLOYEE_ROWS} baris per file. Petunjuk lengkap ada di sheet &quot;Petunjuk&quot;.</li>
          <li>Wajib: Employee ID, nama, email, nomor HP, departemen, jabatan, jenis karyawan, tanggal mulai (dan tanggal berakhir untuk PKWT).</li>
          <li>Departemen baru dibuat otomatis. Employee ID yang sudah ada dilewati, jadi file yang sama aman diunggah ulang.</li>
          <li>
            NIK, NPWP, BPJS, gaji dan rekening <strong>tidak</strong> di-import. Lengkapi dari profil karyawan, tempat data itu disimpan
            terenkripsi.
          </li>
        </ul>
        <a
          href="/dashboard/karyawan/import/template"
          download
          className="inline-block rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
        >
          Unduh template (.xlsx)
        </a>
      </section>

      <section className="space-y-3 card p-5">
        <h2 className="font-medium text-slate-900">2. Unggah file yang sudah diisi</h2>
        <ImportEmployeesForm />
      </section>
    </div>
  );
}
