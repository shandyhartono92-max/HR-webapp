# Redesign tampilan "Korporat Biru"

Tanggal: 10 November 2026
Status: disetujui pengguna, menunggu rencana implementasi

## Tujuan

Mengganti tampilan Portal HR ke gaya "Korporat Biru" sesuai mockup yang dipilih pengguna.
Perubahan berlaku sama di laptop, tablet, dan HP (satu halaman responsif).

**Hanya tampilan.** Tidak ada fitur baru, tidak ada perubahan data, aksi server, hak akses, atau alur kerja.

## Di luar cakupan

- Kotak pencarian global, lonceng notifikasi di header, filter cepat di halaman Karyawan
  (ada di mockup, tetapi hanya gambar; bisa dikerjakan sebagai fitur terpisah nanti)
- Teks tren di kotak angka ("+1 bulan ini") karena butuh perhitungan data baru
- Mode gelap

## Acuan visual

Mockup: `mockup.html` di scratchpad sesi (tema `corp`), dengan screenshot laptop dan HP yang sudah dilihat pengguna.

Token warna utama:

| Peran | Nilai |
|---|---|
| Latar halaman | `#f1f5f9` (slate-100) |
| Kartu | putih, border `#e2e8f0`, radius 10px, bayangan tipis |
| Sidebar | `#0f2744`, teks `#cbd5e1`, judul kelompok `#7c93b0` |
| Menu aktif | latar `#1d4ed8`, teks putih |
| Aksen (brand) | `#1d4ed8` (blue-700), lembut `#dbeafe` |
| Peringatan | latar `#fef3c7`, teks `#92400e`, garis `#fcd34d` |
| Sukses | latar `#dcfce7`, teks `#166534` |
| Kepala tabel | `#f8fafc` |

## Rancangan

### 1. Tema warna

- Tambah skala warna `brand` (50–900, mengikuti skala `blue` Tailwind) di blok `@theme` pada `src/app/globals.css`, beserta latar halaman `#f1f5f9`.
- Ganti semua kelas `teal-*` menjadi `brand-*` (164 pemakaian di 35 file) secara mekanis, dalam commit tersendiri, terpisah dari perubahan susunan.
- Hasilnya: ganti warna di masa depan cukup di `globals.css`.

### 2. Kerangka halaman (`src/app/dashboard/layout.tsx`)

- Sidebar biru tua, lebar 240px di layar `md` ke atas: logo "HR" + "Portal HR", menu dikelompokkan
  **Utama** (Ringkasan), **Rekrutmen** (Lowongan, Kandidat, Bank Kandidat),
  **Karyawan** (Karyawan, Surat, Rekening Gaji), **Pengaturan** (Pengguna, Log Audit, Akun Saya).
  Kelompok yang semua menunya tersembunyi untuk peran tersebut tidak ditampilkan.
- Setiap menu punya ikon SVG inline (tanpa library baru). Menu aktif disorot berdasarkan URL.
- Badge kontrak berakhir pada menu Karyawan dan label "Segera" pada Log Audit tetap ada.
- Header putih: avatar inisial, nama, peran, tombol Keluar. Tidak ada pencarian dan lonceng.
- Di bawah `md`: sidebar disembunyikan, header menampilkan tombol ☰ + logo; ☰ membuka sidebar
  sebagai panel geser dengan latar gelap, tertutup saat menu diklik, latar diklik, atau tombol Escape.
  Ini satu komponen klien kecil; data menu tetap dihitung di server.

### 3. Komponen bersama

- Kartu: radius 10px, border slate-200, bayangan tipis (menggantikan pola `rounded-xl border border-slate-200 bg-white`).
- Tabel: kepala tabel `bg-slate-50`, teks kepala huruf kapital kecil abu, baris dipisah garis tipis;
  pembungkus tabel bisa digulir ke samping, dan kolom yang kurang penting disembunyikan di HP.
- Pill status (aktif, peringatan, netral) dan tombol (utama biru, sekunder putih ber-border) seragam.
- Input form: fokus berwarna brand (lewat `inputClass` di `src/app/ui/field.tsx`).
- Grid memakai `minmax(0, 1fr)` agar isi panjang tidak mendorong layar melebar di HP.

### 4. Halaman

- Semua halaman dashboard ikut berubah lewat bagian 1–3.
- Ringkasan: kotak angka diberi ikon dan garis aksen kiri; angka yang ditampilkan tetap sama.
  Panel wawancara memakai kotak tanggal (tanggal + bulan).
- Karyawan: tabel dengan avatar inisial; baris kontrak ≤ 6 minggu tetap berlatar kuning dengan pill sisa hari.
- Login dan halaman karir publik (`/karir`): hanya warna (lewat bagian 1), tanpa perubahan susunan.

### 5. Pengujian

- `tsc --noEmit` dan `eslint` bersih.
- Screenshot sebelum dan sesudah untuk halaman utama (Ringkasan, Lowongan, Kandidat, Karyawan,
  profil karyawan, Surat, Rekening, Pengguna, Login, Karir) di lebar 1440px dan 390px.
- Klik-uji: login, buka tiap menu, menu ☰ di HP (buka, tutup, Escape), satu form simpan, logout.
- Pastikan tidak ada geser horizontal di 390px.
- Commit setelah pengguna melihat hasil screenshot.

## Risiko

- Cari-ganti `teal` bisa mengenai teks non-kelas. Mitigasi: hanya pola `teal-<angka>` di dalam `src/`, diperiksa lewat diff.
- Komponen klien ☰ tidak boleh mengubah cara sesi dibaca di layout; data menu tetap dari server.
