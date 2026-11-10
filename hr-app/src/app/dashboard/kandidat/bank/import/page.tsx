import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/dal";
import { MAX_IMPORT_ROWS } from "@/lib/candidate-import";
import { ImportCandidatesForm } from "../bank-forms";

export const metadata: Metadata = { title: "Import kandidat" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

export default async function ImportCandidatesPage() {
  await requireRole("ADMIN", "HR");

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link href="/dashboard/kandidat/bank" className="text-sm text-brand-700 hover:underline">
          ← Bank data kandidat
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Import kandidat dari Excel</h1>
        <p className="mt-1 text-sm text-slate-600">Untuk memasukkan banyak kandidat sekaligus, misal dari job fair atau daftar lama.</p>
      </div>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
        <h2 className="font-medium text-slate-900">1. Unduh dan isi template</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Satu baris satu kandidat, maksimal {MAX_IMPORT_ROWS} baris per file. Petunjuk lengkap ada di sheet &quot;Petunjuk&quot;.</li>
          <li>Wajib: nama, email, nomor HP, pendidikan terakhir, sumber, dan bukti persetujuan kandidat.</li>
          <li>Email yang sudah ada di bank data dilewati, jadi file yang sama aman diunggah ulang.</li>
          <li>CV tidak ikut di-import. Unggah CV dari profil kandidat sebelum memasukkannya ke lowongan.</li>
        </ul>
        <a
          href="/dashboard/kandidat/bank/import/template"
          download
          className="inline-block rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
        >
          Unduh template (.xlsx)
        </a>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-medium text-slate-900">2. Unggah file yang sudah diisi</h2>
        <ImportCandidatesForm />
      </section>
    </div>
  );
}
