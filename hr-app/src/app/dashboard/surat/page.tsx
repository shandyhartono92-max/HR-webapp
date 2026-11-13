import type { Metadata } from "next";
import Link from "next/link";
import { LetterPdfLink } from "@/app/ui/letter-pdf-link";
import { siteDb } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { formatDate, letterTypeLabel } from "@/lib/labels";
import { companyInfo } from "@/lib/letters/service";
import { LettersNav } from "./letter-forms";

export const metadata: Metadata = { title: "Surat" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

export default async function LettersPage() {
  const db = await siteDb();
  await requireRole("ADMIN", "HR");

  const letters = await db.letter.findMany({
    orderBy: { issuedAt: "desc" },
    take: 200,
    select: {
      id: true,
      letterNumber: true,
      type: true,
      recipientName: true,
      issuedAt: true,
      validUntil: true,
      employeeId: true,
      applicationId: true,
      fileKey: true,
      issuedBy: { select: { name: true } },
    },
  });
  const company = companyInfo();
  const companyUnset = company.name.startsWith("[");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Surat</h1>
        <LettersNav />
      </div>
      {companyUnset && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Nama perusahaan, alamat, dan penandatangan belum diatur. Isi COMPANY_NAME, COMPANY_ADDRESS, COMPANY_CITY,
          LETTER_SIGNATORY_NAME dan LETTER_SIGNATORY_TITLE di file .env.
        </p>
      )}
      <p className="text-sm text-slate-600">
        Surat untuk karyawan dibuat dari halaman karyawan; surat penawaran dari halaman kandidat di tahap Penawaran.
      </p>

      {letters.length === 0 ? (
        <p className="card p-5 text-sm text-slate-600">Belum ada surat.</p>
      ) : (
        <div className="overflow-x-auto card">
          <table className="w-full text-left text-sm">
            <thead className="table-head border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-medium">Nomor</th>
                <th className="px-4 py-3 font-medium">Jenis</th>
                <th className="px-4 py-3 font-medium">Penerima</th>
                <th className="px-4 py-3 font-medium">Tanggal</th>
                <th className="px-4 py-3 font-medium">Dibuat oleh</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {letters.map((l) => {
                const recipientHref = l.employeeId
                  ? `/dashboard/karyawan/${l.employeeId}`
                  : l.applicationId
                    ? `/dashboard/kandidat/${l.applicationId}`
                    : null;
                return (
                  <tr key={l.id}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{l.letterNumber}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {letterTypeLabel[l.type]}
                      {l.validUntil && <p className="text-xs text-slate-500">berlaku s.d. {formatDate(l.validUntil)}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {recipientHref ? (
                        <Link href={recipientHref} className="text-brand-800 hover:underline">
                          {l.recipientName}
                        </Link>
                      ) : (
                        l.recipientName
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(l.issuedAt)}</td>
                    <td className="px-4 py-3 text-slate-600">{l.issuedBy.name}</td>
                    <td className="px-4 py-3 text-right">
                      <LetterPdfLink letterId={l.id} hasFile={Boolean(l.fileKey)} />
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
