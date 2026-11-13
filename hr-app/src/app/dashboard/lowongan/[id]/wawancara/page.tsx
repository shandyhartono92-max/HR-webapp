import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { siteDb } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { isAiConfigured } from "@/lib/ai";
import { formatDateTime } from "@/lib/labels";
import { JobKitContent } from "@/lib/interview-kit-schema";
import { KitEditor } from "./kit-editor";

export const metadata: Metadata = { title: "Panduan wawancara" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

export default async function InterviewKitPage({ params }: PageProps<"/dashboard/lowongan/[id]/wawancara">) {
  const db = await siteDb();
  const user = await requireUser();
  const { id } = await params;

  const job = await db.job.findUnique({ where: { id }, select: { id: true, title: true, hiringManagerId: true } });
  if (!job) notFound();
  const isHr = user.role === "ADMIN" || user.role === "HR";
  if (!isHr && !(user.role === "HIRING_MANAGER" && job.hiringManagerId === user.id)) redirect("/dashboard?akses=ditolak");

  const kit = await db.interviewKit.findFirst({
    where: { jobId: id, applicationId: null },
    select: {
      status: true,
      content: true,
      aiModel: true,
      updatedAt: true,
      approvedAt: true,
      approvedBy: { select: { name: true } },
    },
  });
  const parsed = kit ? JobKitContent.safeParse(kit.content) : null;

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <Link href="/dashboard/lowongan" className="text-sm text-brand-700 hover:underline">
          ← Lowongan
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Panduan wawancara · {job.title}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Pertanyaan yang sama untuk semua kandidat membuat penilaian lebih adil dan mudah dibandingkan. Hanya panduan
          yang sudah disetujui HR yang tampil untuk pewawancara.
        </p>
      </div>

      {kit && (
        <p
          className={`rounded-md px-4 py-2 text-sm ${kit.status === "APPROVED" ? "bg-brand-50 text-brand-900" : "bg-amber-50 text-amber-900"}`}
        >
          {kit.status === "APPROVED"
            ? `Disetujui oleh ${kit.approvedBy?.name} (${formatDateTime(kit.approvedAt!)}) dan tampil untuk pewawancara.`
            : "Draf: belum tampil untuk pewawancara sampai disetujui HR."}
          {kit.aiModel && " Draf awal dibuat dengan AI; periksa setiap pertanyaan sebelum menyetujui."}
          <span className="block text-xs opacity-75">Terakhir diubah {formatDateTime(kit.updatedAt)}</span>
        </p>
      )}

      <section className="card p-5">
        <KitEditor
          key={kit?.updatedAt.toISOString() ?? "new"}
          jobId={job.id}
          initial={parsed?.success ? parsed.data : null}
          aiEnabled={isAiConfigured()}
          canApprove={isHr}
          status={kit?.status ?? null}
        />
      </section>
    </div>
  );
}
