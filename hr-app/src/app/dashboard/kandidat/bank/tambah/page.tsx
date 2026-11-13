import type { Metadata } from "next";
import Link from "next/link";
import { siteDb } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { AddCandidateForm } from "../bank-forms";

export const metadata: Metadata = { title: "Tambah kandidat" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

export default async function AddCandidatePage() {
  const db = await siteDb();
  await requireRole("ADMIN", "HR");
  const jobs = await db.job.findMany({ where: { status: "OPEN" }, orderBy: { title: "asc" }, select: { id: true, title: true } });

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link href="/dashboard/kandidat/bank" className="text-sm text-brand-700 hover:underline">
          ← Bank data kandidat
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Tambah kandidat</h1>
        <p className="mt-1 text-sm text-slate-600">Untuk CV yang masuk lewat email, WhatsApp, job fair, atau referensi.</p>
      </div>
      <section className="card p-5">
        <AddCandidateForm jobs={jobs.map((j) => ({ id: j.id, name: j.title }))} />
      </section>
    </div>
  );
}
