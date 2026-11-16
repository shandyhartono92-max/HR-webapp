# Deploy Portal HR ke Windows Server

Panduan ini untuk memasang Portal HR di Windows Server yang diakses lewat **IP internal**
(tanpa domain/HTTPS), dengan MariaDB yang **belum terpasang**. Jalankan perintah di
**PowerShell sebagai Administrator**, kecuali disebut lain.

Contoh di bawah memakai folder `C:\PortalHR` dan port `3000`. Ganti kalau perlu.

---

## 0. Yang perlu disiapkan

- Akses Administrator ke server, dan IP server (contoh: `192.168.1.20`).
- Akses ke repo GitHub `HR-webapp` (akun yang bisa clone repo private).
- Identitas PT untuk kop dan tanda tangan surat, **per lokasi** (Batam dan Jakarta):
  nama PT, alamat, kota, nama dan jabatan penandatangan.
- Email dan nama untuk akun Admin pertama.
- (Opsional) API key Anthropic untuk screening CV dengan AI. Tanpa key ini fitur screening mati,
  fitur lain tetap jalan. Server butuh akses internet kalau fitur ini dipakai.

## 1. Pasang Node.js dan Git

1. Unduh dan pasang **Node.js 26 LTS** (versi yang sama dengan laptop pengembangan) dari
   https://nodejs.org. Pilihan default sudah cukup.
2. Unduh dan pasang **Git for Windows** dari https://git-scm.com. Pilihan default sudah cukup.
3. Tutup lalu buka lagi PowerShell, lalu cek:

```powershell
node -v
git --version
```

## 2. Pasang MariaDB

1. Unduh **MariaDB 11.4 LTS (MSI, Windows x86_64)** dari https://mariadb.org/download.
2. Saat instalasi:
   - isi **password root** yang kuat, lalu simpan di tempat aman (password manager);
   - biarkan **"Install as service"** tercentang (nama service `MariaDB`);
   - port tetap **3306**;
   - **jangan** centang "Enable access from remote machines". Database cukup diakses dari server ini.
3. Buka **MySQL Client (MariaDB 11.4)** dari Start Menu, masukkan password root, lalu jalankan
   perintah di bawah. Ganti `PASSWORD_APP` dengan password baru yang kuat, khusus untuk aplikasi
   (bukan password root).

```sql
CREATE DATABASE portal_hr         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE portal_hr_jakarta CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE portal_hr_akun    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'portal_hr'@'localhost' IDENTIFIED BY 'PASSWORD_APP';
GRANT ALL PRIVILEGES ON portal_hr.*         TO 'portal_hr'@'localhost';
GRANT ALL PRIVILEGES ON portal_hr_jakarta.* TO 'portal_hr'@'localhost';
GRANT ALL PRIVILEGES ON portal_hr_akun.*    TO 'portal_hr'@'localhost';
FLUSH PRIVILEGES;
```

> `portal_hr` = database **Batam**, `portal_hr_jakarta` = **Jakarta**, `portal_hr_akun` = akun login
> dan hak akses per lokasi.

> Kalau password mengandung karakter `@ : / ? # %`, nanti di `.env` karakter itu harus ditulis
> dalam bentuk URL-encoded (misalnya `@` jadi `%40`). Lebih mudah pakai password tanpa karakter itu.

## 3. Ambil kode aplikasi

```powershell
cd C:\
git clone https://github.com/shandyhartono92-max/HR-webapp.git PortalHR
cd C:\PortalHR\hr-app
```

## 4. Isi file `.env`

> **Jangan menyalin `.env` dari laptop.** Server prod harus punya secret sendiri.

1. Buat dua secret baru. Jalankan perintah ini **dua kali** dan catat hasilnya
   (satu untuk `SESSION_SECRET`, satu untuk `ENCRYPTION_KEY`):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

2. Salin template, lalu buka di Notepad:

```powershell
Copy-Item .env.example .env
notepad .env
```

3. Isi atau ubah baris-baris berikut (`PASSWORD_APP` = password dari langkah 2):

```ini
DATABASE_URL="mysql://portal_hr:PASSWORD_APP@127.0.0.1:3306/portal_hr"
SHADOW_DATABASE_URL=""
SESSION_SECRET="<secret pertama>"
ENCRYPTION_KEY="<secret kedua>"
SESSION_COOKIE_SECURE="false"

DATABASE_URL_BATAM="mysql://portal_hr:PASSWORD_APP@127.0.0.1:3306/portal_hr"
COMPANY_NAME_BATAM="PT ..."
COMPANY_ADDRESS_BATAM="..."
COMPANY_CITY_BATAM="Batam"
LETTER_SIGNATORY_NAME_BATAM="..."
LETTER_SIGNATORY_TITLE_BATAM="HR Manager"

DATABASE_URL_JAKARTA="mysql://portal_hr:PASSWORD_APP@127.0.0.1:3306/portal_hr_jakarta"
COMPANY_NAME_JAKARTA="PT ..."
COMPANY_ADDRESS_JAKARTA="..."
COMPANY_CITY_JAKARTA="Jakarta"
LETTER_SIGNATORY_NAME_JAKARTA="..."
LETTER_SIGNATORY_TITLE_JAKARTA="..."

ACCOUNTS_DATABASE_URL="mysql://portal_hr:PASSWORD_APP@127.0.0.1:3306/portal_hr_akun"
ACCOUNTS_SHADOW_DATABASE_URL=""

BACKUP_DIR="D:\PortalHR-backup"
MYSQLDUMP="C:\Program Files\MariaDB 11.4\bin\mysqldump.exe"

SEED_ADMIN_PASSWORD=""
ANTHROPIC_API_KEY=""
```

Penjelasan singkat:

- **`SESSION_COOKIE_SECURE="false"` wajib** selama portal dibuka lewat `http://IP`. Tanpa baris ini,
  login terlihat berhasil, tapi saat pengguna membuka halaman berikutnya ia terlempar lagi ke
  halaman login. Kalau nanti sudah pakai HTTPS, kosongkan lagi nilainya.
- **`ENCRYPTION_KEY`** mengenkripsi NIK, NPWP, BPJS, nomor rekening dan gaji. **Kalau key ini hilang,
  data itu tidak bisa dibuka lagi.** Simpan salinannya di luar server (password manager atau brankas),
  dan jangan pernah menggantinya setelah ada data.
- `BACKUP_DIR` sebaiknya di drive lain dari aplikasi, dan **di luar** `C:\PortalHR`.
- Identitas PT boleh dilengkapi nanti. Selama masih kosong, surat menampilkan placeholder.
- Jangan bagikan file `.env` ke siapa pun. File ini berisi password database dan secret.

## 5. Install, buat tabel, build

```powershell
cd C:\PortalHR\hr-app
npm ci
npm run db:migrate:accounts
npm run db:migrate:sites
npm run build
```

- `npm ci` memasang paket dan membuat client Prisma.
- `db:migrate:accounts` harus jalan **sebelum** `db:migrate:sites`.
- `npm run build` butuh beberapa menit. Hasilnya harus diakhiri daftar halaman tanpa error.

## 6. Buat akun Admin pertama

```powershell
npm run admin:create -- admin@perusahaan.co.id "Nama Lengkap"
```

Perintah ini mencetak **kata sandi sementara satu kali saja**, jadi catat saat itu juga. Akun ini
berperan Admin di Batam dan Jakarta, dan wajib mengganti kata sandi saat login pertama.

> Jangan pakai `npm run db:seed` di server. Seed itu untuk pengembangan dan ikut membuat data demo.

## 7. Uji jalan sekali (manual)

```powershell
npx next start -p 3000 -H 0.0.0.0
```

Dari PC lain di jaringan kantor, buka `http://192.168.1.20:3000/login` (pakai IP server),
lalu cek hal-hal berikut:

- [ ] Login dengan akun Admin, pilih lokasi **Batam**, lalu ganti kata sandi.
- [ ] Buka menu **Karyawan**. Pastikan tidak terlempar ke halaman login.
- [ ] Keluar, lalu login lagi dengan lokasi **Jakarta**.
- [ ] Halaman karir `http://192.168.1.20:3000/karir` terbuka.

Kalau PC lain tidak bisa membuka halaman, lanjut dulu ke langkah 8 (firewall). Hentikan server
dengan `Ctrl+C` sebelum lanjut ke langkah 9.

## 8. Buka port di firewall

Port dibuka hanya untuk jaringan kantor (profil Domain dan Private), tidak untuk Public:

```powershell
New-NetFirewallRule -DisplayName "Portal HR" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Domain,Private
```

## 9. Jalankan sebagai Windows service

Supaya Portal HR otomatis jalan saat server menyala (tanpa perlu login), daftarkan sebagai
service dengan **NSSM**:

1. Unduh NSSM dari https://nssm.cc/download, ekstrak, lalu salin `win64\nssm.exe` ke `C:\Windows\System32`.
2. Daftarkan service:

```powershell
nssm install PortalHR "C:\Program Files\nodejs\node.exe" "C:\PortalHR\hr-app\node_modules\next\dist\bin\next start -p 3000 -H 0.0.0.0"
nssm set PortalHR AppDirectory "C:\PortalHR\hr-app"
nssm set PortalHR AppEnvironmentExtra NODE_ENV=production
New-Item -ItemType Directory -Force C:\PortalHR\logs
nssm set PortalHR AppStdout "C:\PortalHR\logs\portal-hr.log"
nssm set PortalHR AppStderr "C:\PortalHR\logs\portal-hr-error.log"
nssm set PortalHR AppRotateFiles 1
nssm set PortalHR AppRotateBytes 10485760
nssm set PortalHR DependOnService MariaDB
nssm set PortalHR Start SERVICE_AUTO_START
nssm start PortalHR
```

3. Cek: `Get-Service PortalHR` harus menunjukkan **Running**. Setelah itu, ulangi pengecekan di langkah 7
   dari PC lain.

> Jalankan **satu** service saja. Pengecekan otomatis per jam (Employee ID trainee dan notifikasi KITAS)
> berjalan di dalam proses aplikasi. Dua proses sekaligus berarti pengecekan itu jalan dua kali.

Perintah yang berguna:

```powershell
nssm restart PortalHR      # setelah mengubah .env atau update
nssm stop PortalHR
Get-Content C:\PortalHR\logs\portal-hr-error.log -Tail 50
```

## 10. Jadwal backup dan retensi data

Ada dua tugas harian, dibuat lewat Task Scheduler dan dijalankan sebagai SYSTEM:

```powershell
# Backup database setiap hari jam 23:00 (ke BACKUP_DIR)
schtasks /Create /TN "PortalHR Backup" /SC DAILY /ST 23:00 /RU SYSTEM /RL HIGHEST /TR "cmd /c cd /d C:\PortalHR\hr-app && npm run backup >> C:\PortalHR\logs\backup.log 2>&1"

# Salin file upload (CV, dokumen, PDF surat) setiap hari jam 23:30
schtasks /Create /TN "PortalHR Backup File" /SC DAILY /ST 23:30 /RU SYSTEM /RL HIGHEST /TR "robocopy C:\PortalHR\hr-app\storage D:\PortalHR-backup\storage /MIR /R:1 /W:5 /LOG+:C:\PortalHR\logs\backup-file.log"

# Retensi UU PDP (anonimkan kandidat/mantan karyawan yang lewat masa simpan), jam 01:00
schtasks /Create /TN "PortalHR Retensi" /SC DAILY /ST 01:00 /RU SYSTEM /RL HIGHEST /TR "cmd /c cd /d C:\PortalHR\hr-app && npm run retention >> C:\PortalHR\logs\retention.log 2>&1"
```

Untuk mengetes backup sekarang juga: `schtasks /Run /TN "PortalHR Backup"`. Setelah itu harus muncul
folder bertanggal berisi 3 file `.sql` di `D:\PortalHR-backup`.

> Backup yang hanya ada di server yang sama tidak menolong kalau disk server rusak. Salin
> `D:\PortalHR-backup` secara berkala ke tempat lain (NAS atau drive eksternal), dan simpan
> `ENCRYPTION_KEY` terpisah dari backup itu.

## 11. Update aplikasi di kemudian hari

```powershell
cd C:\PortalHR\hr-app
schtasks /Run /TN "PortalHR Backup"     # backup dulu
nssm stop PortalHR
git pull
npm ci
npm run db:migrate:accounts
npm run db:migrate:sites
npm run build
nssm start PortalHR
```

## Kalau ada masalah

| Gejala | Penyebab dan solusi |
|---|---|
| Login berhasil, tapi saat membuka menu lain kembali ke halaman login | `SESSION_COOKIE_SECURE="false"` belum diisi di `.env`. Isi, lalu jalankan `nssm restart PortalHR` |
| PC lain tidak bisa membuka `http://IP:3000` | Firewall (langkah 8), atau service belum jalan (`Get-Service PortalHR`) |
| Error `ECONNREFUSED 127.0.0.1:3306` di log | Service MariaDB mati. Jalankan `Start-Service MariaDB` |
| `Access denied for user 'portal_hr'` | Password di `.env` tidak sama dengan password di langkah 2, atau karakter khusus belum di-encode |
| Migrasi gagal: `You do not have the SUPER privilege and binary logging is enabled` | Binary log MariaDB aktif. Tambahkan `log_bin_trust_function_creators=1` di bagian `[mysqld]` file `my.ini` (folder `data` MariaDB), jalankan `Restart-Service MariaDB`, lalu ulangi migrasi |
| Backup gagal: `mysqldump` tidak ditemukan | Cek path `MYSQLDUMP` di `.env` sesuai folder instalasi MariaDB |
| Data terenkripsi tidak terbaca setelah pindah server | `ENCRYPTION_KEY` berbeda dari server lama. Pakai key yang lama |
