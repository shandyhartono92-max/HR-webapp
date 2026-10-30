import type { Metadata } from "next";
import { PRIVACY_NOTICE_VERSION, RETENTION_MONTHS, TALENT_POOL_RETENTION_MONTHS } from "@/lib/privacy";

export const metadata: Metadata = { title: "Pemberitahuan Privasi Pelamar" };

// DRAFT: have this text reviewed by your legal team before going live.
// When the text changes, bump PRIVACY_NOTICE_VERSION in src/lib/privacy.ts.
const HR_CONTACT_EMAIL = "hr@perusahaan.local";

export default function PrivacyNoticePage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-10 text-slate-700">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Pemberitahuan Privasi Pelamar</h1>
        <p className="mt-1 text-sm text-slate-500">Versi {PRIVACY_NOTICE_VERSION}</p>
      </div>

      <p>
        Pemberitahuan ini menjelaskan bagaimana kami memproses data pribadi Anda saat Anda melamar pekerjaan, sesuai
        dengan Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP).
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-slate-900">Data yang kami kumpulkan</h2>
        <p>
          Nama, email, nomor telepon, kota domisili, pendidikan terakhir, gaji yang diharapkan, ketersediaan mulai
          bekerja, serta isi CV yang Anda unggah.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-slate-900">Tujuan pemrosesan</h2>
        <p>
          Menilai kesesuaian Anda dengan lowongan, menghubungi Anda terkait proses seleksi, dan menjalankan proses
          rekrutmen.
        </p>
        <p>
          Kami menggunakan layanan kecerdasan buatan (AI) dari pihak ketiga untuk membaca CV dan memberi skor kecocokan
          dengan kualifikasi lowongan. Untuk itu, isi CV Anda dikirim ke penyedia layanan tersebut, yang servernya dapat
          berada di luar Indonesia. Penyedia hanya memproses data atas instruksi kami. Agama, usia, status pernikahan,
          foto, dan data sejenis tidak digunakan dalam penilaian. Skor AI hanya bahan pertimbangan; keputusan akhir
          selalu dibuat oleh tim HR.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-slate-900">Lama penyimpanan</h2>
        <p>
          Jika Anda tidak diterima, data Anda kami hapus atau anonimkan {RETENTION_MONTHS} bulan setelah proses
          seleksi. Jika Anda memilih untuk disimpan dalam <em>talent pool</em>, data disimpan hingga{" "}
          {TALENT_POOL_RETENTION_MONTHS} bulan.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-slate-900">Siapa yang dapat mengakses</h2>
        <p>
          Hanya tim HR dan manajer yang merekrut untuk posisi tersebut. Data disimpan di server dengan akses terbatas
          dan tidak kami jual atau bagikan kepada pihak lain untuk tujuan pemasaran.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-slate-900">Hak Anda</h2>
        <p>
          Anda berhak meminta akses, perbaikan, atau penghapusan data Anda, serta menarik persetujuan kapan saja.
          Hubungi kami di <a href={`mailto:${HR_CONTACT_EMAIL}`} className="text-teal-700 underline">{HR_CONTACT_EMAIL}</a>.
        </p>
      </section>
    </main>
  );
}
