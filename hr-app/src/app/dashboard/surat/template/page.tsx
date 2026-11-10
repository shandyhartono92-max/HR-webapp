import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { letterTypeLabel } from "@/lib/labels";
import { activeTemplate, companyInfo } from "@/lib/letters/service";
import type { LetterType } from "@/generated/prisma/enums";
import { LettersNav, TemplateEditor } from "../letter-forms";

export const metadata: Metadata = { title: "Template surat" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

const editable: LetterType[] = [
  "SP1",
  "SP2",
  "SP3",
  "SURAT_KETERANGAN_KERJA",
  "PAKLARING",
  "MUTASI",
  "PROMOSI",
  "DEMOSI",
  "OFFER_LETTER",
];

// Preview text for {{alasan}}; SP letters use the default below
const sampleReasons: Partial<Record<LetterType, string>> = {
  MUTASI: "Kebutuhan tenaga kerja di Kantor Cabang Surabaya dan pengalaman yang bersangkutan di bidang operasional.",
  PROMOSI: "Hasil penilaian kinerja tahun 2026 dengan nilai sangat baik serta kebutuhan posisi Supervisor Administrasi.",
  DEMOSI:
    "Hasil evaluasi kinerja dua periode berturut-turut di bawah target, setelah pembinaan dan Surat Peringatan Kedua tanggal 1 Agustus 2026.",
};

export default async function TemplatesPage({ searchParams }: PageProps<"/dashboard/surat/template">) {
  await requireRole("ADMIN", "HR");
  const { jenis } = await searchParams;
  const selected = editable.includes(jenis as LetterType) ? (jenis as LetterType) : "SP1";

  // Sequential on purpose: the local dev database handles one connection at a time
  const template = await activeTemplate(selected);
  const c = companyInfo();
  const sampleVars = {
    nama: "Budi Santoso",
    nomor_induk: "EMP-2026-000",
    jabatan: "Staf Administrasi",
    departemen: "Human Resources",
    status_kerja: "Kontrak (PKWT)",
    tanggal_mulai: "1 Maret 2025",
    tanggal_berakhir: "28 Februari 2026",
    tanggal_surat: "30 Oktober 2026",
    alasan: sampleReasons[selected] ?? "Tidak masuk kerja tanpa keterangan selama 3 (tiga) hari berturut-turut pada 20–22 Oktober 2026.",
    berlaku_hingga: "30 April 2027",
    keperluan: "pengajuan KPR",
    gaji: "Rp7.500.000",
    lokasi: "Jakarta",
    batas_konfirmasi: "6 November 2026",
    jabatan_baru: selected === "DEMOSI" ? "Staf Junior Administrasi" : selected === "PROMOSI" ? "Supervisor Administrasi" : "Staf Administrasi",
    departemen_baru: selected === "MUTASI" ? "Operasional" : "Human Resources",
    lokasi_baru: "Kantor Cabang Surabaya",
    tanggal_efektif: "1 Desember 2026",
    gaji_baru: "Rp9.000.000 per bulan",
    nama_perusahaan: c.name,
    kota: c.city,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Template surat</h1>
        <LettersNav />
      </div>
      <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Teks bawaan adalah draf. Mohon ditinjau HR/legal dan disesuaikan dengan Peraturan Perusahaan atau PKB sebelum
        digunakan. Setiap penyimpanan membuat versi baru; surat yang sudah terbit tidak berubah.
      </p>
      <nav className="flex flex-wrap gap-2">
        {editable.map((t) => (
          <a
            key={t}
            href={`?jenis=${t}`}
            className={`rounded-full px-3 py-1 text-sm ${t === selected ? "bg-brand-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}
          >
            {letterTypeLabel[t]}
          </a>
        ))}
      </nav>
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <TemplateEditor key={`${selected}-${template.version}`} type={selected} template={template} sampleVars={sampleVars} />
      </section>
    </div>
  );
}
