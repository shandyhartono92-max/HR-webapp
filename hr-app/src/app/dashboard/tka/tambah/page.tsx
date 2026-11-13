import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/dal";
import { ForeignWorkerForm } from "../foreign-worker-form";

export const metadata: Metadata = { title: "Tambah TKA" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

export default async function NewForeignWorkerPage() {
  await requireRole("ADMIN", "HR");
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <Link href="/dashboard/tka" className="text-sm text-brand-700 hover:underline">
          ← Semua TKA
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Tambah TKA</h1>
        <p className="mt-1 text-sm text-slate-600">Data tenaga kerja asing untuk memantau masa berlaku KITAS. Semua isian wajib.</p>
      </div>
      <div className="card p-5">
        <ForeignWorkerForm />
      </div>
    </div>
  );
}
