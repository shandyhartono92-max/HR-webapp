// Default letter templates (DRAFT wording: have HR/legal review before use).
// They are copied into LetterTemplate as version 1 the first time they're needed;
// after that, HR edits them in the app and each save creates a new version.
//
// Body format, understood by the PDF renderer:
// - blank line = new paragraph
// - "Label : value" lines are laid out as an aligned table row

import type { LetterType } from "@/generated/prisma/enums";

const identity = `Nama : {{nama}}
Nomor Induk : {{nomor_induk}}
Jabatan : {{jabatan}}
Departemen : {{departemen}}`;

function warning(level: "Pertama" | "Kedua" | "Ketiga", next: string) {
  return `Yang bertanda tangan di bawah ini, atas nama {{nama_perusahaan}}, dengan ini memberikan Surat Peringatan ${level} kepada:

${identity}

Surat peringatan ini diberikan karena yang bersangkutan:

{{alasan}}

Perbuatan tersebut bertentangan dengan peraturan perusahaan dan/atau perjanjian kerja yang berlaku. Surat peringatan ini berlaku selama 6 (enam) bulan, terhitung sejak {{tanggal_surat}} sampai dengan {{berlaku_hingga}}.

${next}

Demikian surat peringatan ini dibuat untuk diperhatikan dan dipatuhi.`;
}

// Before/after block shared by the mutasi, promosi and demosi decrees
function change(verb: string, extraRows = "") {
  return `Nama : {{nama}}
Nomor Induk : {{nomor_induk}}

${verb} dari:

Jabatan : {{jabatan}}
Departemen : {{departemen}}

menjadi:

Jabatan : {{jabatan_baru}}
Departemen : {{departemen_baru}}${extraRows}`;
}

const decreeClosing = `Hal-hal lain yang tidak diatur dalam surat keputusan ini tetap mengikuti perjanjian kerja dan Peraturan Perusahaan yang berlaku.

Apabila di kemudian hari terdapat kekeliruan dalam surat keputusan ini, akan diadakan perbaikan sebagaimana mestinya.

Demikian surat keputusan ini dibuat untuk dilaksanakan dengan penuh tanggung jawab.`;

export const defaultTemplates: Record<LetterType, { name: string; body: string }> = {
  SP1: {
    name: "SURAT PERINGATAN PERTAMA (SP-1)",
    body: warning(
      "Pertama",
      "Apabila dalam masa berlaku surat ini yang bersangkutan kembali melakukan pelanggaran, perusahaan akan memberikan Surat Peringatan Kedua.",
    ),
  },
  SP2: {
    name: "SURAT PERINGATAN KEDUA (SP-2)",
    body: warning(
      "Kedua",
      "Apabila dalam masa berlaku surat ini yang bersangkutan kembali melakukan pelanggaran, perusahaan akan memberikan Surat Peringatan Ketiga.",
    ),
  },
  SP3: {
    name: "SURAT PERINGATAN KETIGA (SP-3)",
    body: warning(
      "Ketiga",
      "Surat ini merupakan peringatan terakhir. Apabila dalam masa berlaku surat ini yang bersangkutan kembali melakukan pelanggaran, perusahaan dapat melakukan pemutusan hubungan kerja sesuai dengan ketentuan peraturan perundang-undangan yang berlaku.",
    ),
  },
  SURAT_KETERANGAN_KERJA: {
    name: "SURAT KETERANGAN KERJA",
    body: `Yang bertanda tangan di bawah ini, atas nama {{nama_perusahaan}}, menerangkan bahwa:

${identity}

adalah benar karyawan {{nama_perusahaan}} sejak {{tanggal_mulai}} sampai dengan saat ini, dengan status hubungan kerja {{status_kerja}}.

Surat keterangan ini dibuat untuk keperluan {{keperluan}}.

Demikian surat keterangan ini dibuat dengan sebenarnya untuk dapat dipergunakan sebagaimana mestinya.`,
  },
  PAKLARING: {
    name: "SURAT KETERANGAN PENGALAMAN KERJA",
    body: `Yang bertanda tangan di bawah ini, atas nama {{nama_perusahaan}}, menerangkan bahwa:

${identity}

adalah benar pernah bekerja di {{nama_perusahaan}} sejak {{tanggal_mulai}} sampai dengan {{tanggal_berakhir}}, dengan jabatan terakhir sebagai {{jabatan}}.

Selama bekerja, yang bersangkutan telah menunjukkan dedikasi dan tanggung jawab terhadap pekerjaannya. Kami mengucapkan terima kasih atas kontribusi yang telah diberikan dan berharap kesuksesan untuk yang bersangkutan di masa mendatang.

Demikian surat keterangan ini dibuat dengan sebenarnya untuk dapat dipergunakan sebagaimana mestinya.`,
  },
  MUTASI: {
    name: "SURAT KEPUTUSAN MUTASI KARYAWAN",
    body: `Yang bertanda tangan di bawah ini, atas nama {{nama_perusahaan}}, dengan pertimbangan:

{{alasan}}

dengan ini memutuskan untuk memindahkan (memutasikan) karyawan berikut:

${change(
  "Dipindahkan",
  `
Lokasi kerja : {{lokasi_baru}}`,
)}

Mutasi ini berlaku efektif sejak {{tanggal_efektif}}. Yang bersangkutan diminta melakukan serah terima pekerjaan dengan atasan sebelumnya sebelum tanggal tersebut. Status hubungan kerja, masa kerja, serta gaji dan tunjangan yang bersangkutan tidak berubah karena mutasi ini, kecuali ditetapkan lain secara tertulis.

${decreeClosing}`,
  },
  PROMOSI: {
    name: "SURAT KEPUTUSAN PROMOSI JABATAN",
    body: `Yang bertanda tangan di bawah ini, atas nama {{nama_perusahaan}}, berdasarkan penilaian atas kinerja, kompetensi, dan dedikasi karyawan, dengan pertimbangan:

{{alasan}}

dengan ini memutuskan untuk mempromosikan karyawan berikut:

${change(
  "Dipromosikan",
  `
Gaji pokok : {{gaji_baru}}`,
)}

Promosi ini berlaku efektif sejak {{tanggal_efektif}}. Dengan jabatan baru tersebut, yang bersangkutan menerima tugas dan tanggung jawab sesuai uraian jabatan yang berlaku.

Kami mengucapkan selamat dan berharap yang bersangkutan dapat terus memberikan kontribusi terbaik bagi {{nama_perusahaan}}.

${decreeClosing}`,
  },
  DEMOSI: {
    name: "SURAT KEPUTUSAN DEMOSI",
    body: `Yang bertanda tangan di bawah ini, atas nama {{nama_perusahaan}}, setelah melalui evaluasi dan pembinaan sesuai Peraturan Perusahaan, dengan pertimbangan:

{{alasan}}

dengan ini memutuskan untuk menurunkan jabatan (demosi) karyawan berikut:

${change(
  "Diturunkan",
  `
Gaji pokok : {{gaji_baru}}`,
)}

Demosi ini berlaku efektif sejak {{tanggal_efektif}}. Perusahaan akan melakukan evaluasi kembali atas kinerja yang bersangkutan, dan diharapkan yang bersangkutan dapat memperbaiki kinerjanya.

Apabila yang bersangkutan berkeberatan atas keputusan ini, keberatan dapat disampaikan secara tertulis kepada bagian Human Resources paling lambat 7 (tujuh) hari kerja sejak surat ini diterima.

${decreeClosing}`,
  },
  BERAKHIR_KONTRAK: {
    name: "SURAT PEMBERITAHUAN BERAKHIRNYA PERJANJIAN KERJA",
    body: `Yang bertanda tangan di bawah ini, atas nama {{nama_perusahaan}}, dengan ini memberitahukan kepada:

${identity}

bahwa Perjanjian Kerja Waktu Tertentu (PKWT) yang bersangkutan:

Nomor kontrak : {{nomor_kontrak}}
Masa kontrak : {{kontrak_mulai}} s.d. {{tanggal_berakhir}}

akan berakhir pada tanggal {{tanggal_berakhir}} dan tidak diperpanjang. Dengan demikian, hubungan kerja antara yang bersangkutan dan {{nama_perusahaan}} berakhir pada tanggal tersebut.

Sehubungan dengan berakhirnya PKWT tersebut, perusahaan akan memberikan uang kompensasi sesuai ketentuan peraturan perundang-undangan yang berlaku, serta menyelesaikan hak-hak lain yang bersangkutan yang belum diterima.

Yang bersangkutan diminta menyelesaikan serah terima pekerjaan, dokumen, dan inventaris perusahaan kepada atasan langsung paling lambat pada hari terakhir bekerja.

Kami mengucapkan terima kasih atas dedikasi dan kontribusi yang telah diberikan selama bekerja di {{nama_perusahaan}}, dan berharap kesuksesan untuk yang bersangkutan di masa mendatang.

Demikian surat pemberitahuan ini disampaikan untuk diketahui dan dipergunakan sebagaimana mestinya.`,
  },
  PANGGILAN: {
    name: "SURAT PANGGILAN",
    body: `Kepada Yth.
Sdr/i {{nama}}
{{alamat}}

Perihal : Panggilan {{panggilan_ke}}

Dengan hormat,

Berdasarkan catatan kehadiran, karyawan dengan identitas berikut:

${identity}

tidak masuk bekerja sejak {{tidak_masuk_sejak}} sampai dengan tanggal surat ini tanpa keterangan yang sah dan tanpa pemberitahuan kepada perusahaan.

Sehubungan dengan hal tersebut, perusahaan memanggil Saudara/i untuk menghadap pada:

Hari, tanggal : {{tanggal_menghadap}}
Pukul : {{jam_menghadap}} WIB
Tempat : {{tempat_menghadap}}
Menemui : Bagian Human Resources

dengan membawa bukti atau keterangan yang sah atas ketidakhadiran tersebut.

Apabila Saudara/i tidak memenuhi panggilan ini tanpa alasan yang sah, perusahaan akan mengambil tindakan sesuai Peraturan Perusahaan dan peraturan perundang-undangan yang berlaku. Karyawan yang mangkir selama 5 (lima) hari kerja atau lebih berturut-turut tanpa keterangan tertulis yang dilengkapi bukti yang sah, dan telah dipanggil oleh perusahaan 2 (dua) kali secara patut dan tertulis, dapat diputus hubungan kerjanya karena dikualifikasikan mengundurkan diri.

Demikian surat panggilan ini disampaikan untuk dipenuhi.`,
  },
  OFFER_LETTER: {
    name: "SURAT PENAWARAN KERJA",
    body: `Kepada Yth.
Sdr/i {{nama}}

Dengan hormat,

Terima kasih atas waktu dan minat Saudara/i untuk bergabung dengan {{nama_perusahaan}}. Berdasarkan proses seleksi yang telah dilalui, dengan senang hati kami menawarkan posisi berikut:

Posisi : {{jabatan}}
Departemen : {{departemen}}
Status hubungan kerja : {{status_kerja}}
Tanggal mulai bekerja : {{tanggal_mulai}}
Gaji pokok : {{gaji}} per bulan
Lokasi kerja : {{lokasi}}

Ketentuan lain mengenai hak dan kewajiban akan diatur dalam perjanjian kerja yang ditandatangani pada hari pertama bekerja. Penawaran ini bersifat rahasia.

Mohon konfirmasi penerimaan penawaran ini paling lambat {{batas_konfirmasi}} dengan membalas email ini atau menghubungi tim HR kami.

Kami menantikan kehadiran Saudara/i di {{nama_perusahaan}}.`,
  },
  OTHER: {
    name: "SURAT",
    body: `Yang bertanda tangan di bawah ini, atas nama {{nama_perusahaan}}, menerangkan bahwa:

${identity}

{{keperluan}}`,
  },
};
