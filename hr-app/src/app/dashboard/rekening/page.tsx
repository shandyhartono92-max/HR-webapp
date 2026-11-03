import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { peekDevOtp } from "@/lib/banking";
import { formatDate, formatDateTime } from "@/lib/labels";
import type { BankChangeStatus } from "@/generated/prisma/enums";
import { BankChangeForm, CancelRequestButton, HrCancelButton, OtpStep, ReviewForms } from "./bank-forms";

export const metadata: Metadata = { title: "Rekening gaji" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

const statusLabel: Record<BankChangeStatus, string> = {
  DRAFT: "Menunggu kode OTP",
  PENDING_APPROVAL: "Menunggu persetujuan HR",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};

function NameCheck({ matches, inquiryName }: { matches: boolean | null; inquiryName: string | null }) {
  if (matches === null) return <span className="text-slate-500">Nama belum dicek</span>;
  return matches ? (
    <span className="rounded bg-teal-50 px-1.5 py-0.5 text-xs font-medium text-teal-800">Nama cocok: {inquiryName}</span>
  ) : (
    <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-800">Nama di bank: {inquiryName}</span>
  );
}

export default async function BankAccountPage() {
  const user = await requireUser();
  const isHr = user.role === "ADMIN" || user.role === "HR";

  // Only last-4 and display fields are selected; *Enc columns stay on the server
  const mine = user.employee
    ? await db.employee.findUnique({
        where: { id: user.employee.id },
        select: {
          fullName: true,
          bankAccounts: {
            where: { isActive: true },
            select: { bankName: true, accountNumberLast4: true, accountHolderName: true, effectiveFrom: true },
          },
          bankChangeRequests: {
            orderBy: { createdAt: "desc" },
            take: 10,
            select: {
              id: true,
              status: true,
              bankName: true,
              accountNumberLast4: true,
              createdAt: true,
              rejectionReason: true,
              effectivePayroll: true,
            },
          },
        },
      })
    : null;

  const queue = isHr
    ? await db.bankChangeRequest.findMany({
        where: { status: "PENDING_APPROVAL" },
        orderBy: { submittedAt: "asc" },
        select: {
          id: true,
          bankName: true,
          accountNumberLast4: true,
          accountHolderName: true,
          inquiryName: true,
          nameMatches: true,
          submittedAt: true,
          requestedById: true,
          requestedBy: { select: { name: true } },
          employee: {
            select: {
              id: true,
              fullName: true,
              employeeNumber: true,
              userId: true,
              bankAccounts: { where: { isActive: true }, select: { bankName: true, accountNumberLast4: true } },
            },
          },
        },
      })
    : [];

  const open = mine?.bankChangeRequests.find((r) => r.status === "DRAFT" || r.status === "PENDING_APPROVAL");
  const active = mine?.bankAccounts[0];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Rekening gaji</h1>

      {isHr && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-medium text-slate-900">Menunggu persetujuan ({queue.length})</h2>
          <p className="mt-1 text-xs text-slate-500">
            Sebelum menyetujui, pastikan permintaan memang dari karyawan. Bila ragu, telepon karyawan di nomor yang tercatat
            di HR, bukan nomor yang dikirim lewat chat.
          </p>
          {queue.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">Tidak ada permintaan.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {queue.map((r) => {
                const own = r.employee.userId === user.id;
                const current = r.employee.bankAccounts[0];
                return (
                  <li key={r.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="text-sm">
                        <Link href={`/dashboard/karyawan/${r.employee.id}`} className="font-medium text-teal-800 hover:underline">
                          {r.employee.fullName}
                        </Link>
                        <span className="text-slate-500"> · {r.employee.employeeNumber}</span>
                        <p className="mt-1 text-slate-700">
                          Baru: <strong>{r.bankName} ••••{r.accountNumberLast4}</strong> a.n. {r.accountHolderName}
                        </p>
                        <p className="text-slate-500">
                          Saat ini: {current ? `${current.bankName} ••••${current.accountNumberLast4}` : "belum ada"}
                        </p>
                        <p className="mt-1">
                          <NameCheck matches={r.nameMatches} inquiryName={r.inquiryName} />
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {r.requestedBy ? (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">
                              Diinput oleh HR: {r.requestedBy.name} (tanpa OTP karyawan, lihat dasar pengajuan di log audit)
                            </span>
                          ) : (
                            "Diajukan karyawan sendiri, dikonfirmasi dengan OTP"
                          )}
                        </p>
                      </div>
                      <p className="text-xs text-slate-500">{r.submittedAt ? formatDateTime(r.submittedAt) : ""}</p>
                    </div>
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      {own ? (
                        <p className="text-sm text-amber-800">Ini permintaan Anda sendiri; harus disetujui oleh HR lain.</p>
                      ) : r.requestedById === user.id ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-sm text-amber-800">Anda yang menginput pengajuan ini; harus disetujui oleh HR/Admin lain.</p>
                          <HrCancelButton requestId={r.id} />
                        </div>
                      ) : (
                        <ReviewForms requestId={r.id} nameMatches={r.nameMatches} />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {mine ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-medium text-slate-900">Rekening saya</h2>
          <p className="mt-2 text-sm text-slate-700">
            {active ? (
              <>
                Aktif: <strong>{active.bankName} ••••{active.accountNumberLast4}</strong> a.n. {active.accountHolderName} (sejak{" "}
                {formatDate(active.effectiveFrom)})
              </>
            ) : (
              "Belum ada rekening gaji terdaftar."
            )}
          </p>

          <div className="mt-4 border-t border-slate-100 pt-4">
            {open?.status === "DRAFT" ? (
              <>
                <h3 className="mb-1 text-sm font-medium text-slate-900">Konfirmasi perubahan</h3>
                <p className="mb-3 text-sm text-slate-600">
                  Kami mengirim kode 6 digit ke email Anda untuk {open.bankName} ••••{open.accountNumberLast4}. Kode berlaku 10 menit.
                </p>
                <OtpStep requestId={open.id} devCode={peekDevOtp(open.id)} />
              </>
            ) : open?.status === "PENDING_APPROVAL" ? (
              <div className="space-y-3 text-sm">
                <p className="rounded-md bg-sky-50 px-3 py-2 text-sky-900">
                  Permintaan {open.bankName} ••••{open.accountNumberLast4} sedang menunggu persetujuan HR.
                </p>
                <CancelRequestButton requestId={open.id} />
              </div>
            ) : (
              <>
                <h3 className="mb-3 text-sm font-medium text-slate-900">{active ? "Ganti rekening gaji" : "Daftarkan rekening gaji"}</h3>
                <BankChangeForm defaultHolderName={mine.fullName} />
              </>
            )}
          </div>

          {mine.bankChangeRequests.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-slate-600">Riwayat permintaan</summary>
              <ul className="mt-2 divide-y divide-slate-100">
                {mine.bankChangeRequests.map((r) => (
                  <li key={r.id} className="py-2">
                    {r.bankName} ••••{r.accountNumberLast4} · {statusLabel[r.status]} · {formatDate(r.createdAt)}
                    {r.effectivePayroll && <span className="text-slate-500"> · berlaku {r.effectivePayroll}</span>}
                    {r.rejectionReason && <p className="text-xs text-red-700">Alasan: {r.rejectionReason}</p>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      ) : (
        !isHr && (
          <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            Akun Anda belum terhubung ke data karyawan. Hubungi HR.
          </p>
        )
      )}
    </div>
  );
}
