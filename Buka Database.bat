@echo off
rem Opens the Portal HR database (portal_hr in XAMPP's MariaDB) for viewing.
rem MariaDB serves many connections at once, so Portal HR keeps running.
rem Uses phpMyAdmin when XAMPP's Apache is on; otherwise Prisma Studio.
title Buka Database
cd /d "%~dp0hr-app"
if not defined XAMPP_DIR set "XAMPP_DIR=C:\xampp"

rem "ping" asks the server itself; it succeeds even when the made-up user is refused
"%XAMPP_DIR%\mysql\bin\mysqladmin.exe" --connect-timeout=2 -h 127.0.0.1 -P 3306 -u ping_check --password=x ping >nul 2>&1
if errorlevel 1 (
  echo MariaDB belum jalan. Nyalakan MySQL di XAMPP Control Panel, atau jalankan "Start Portal HR.bat".
  pause
  exit /b 1
)

echo.
echo === Buka Database (portal_hr) ===
echo  - NIK/NPWP/BPJS/rekening tampil terenkripsi (v1.xxx). Lihat isinya lewat aplikasi.
echo  - Hati-hati mengubah atau menghapus data di sini: langsung tersimpan, tanpa audit log.
echo  - Tabel audit_log terkunci: isinya tidak bisa diubah atau dihapus.
echo  - phpMyAdmin meminta login: pakai user root dan password-nya (lihat catatan password MariaDB Anda).
echo.

netstat -ano | findstr /r /c:":80 .*LISTENING" >nul
if not errorlevel 1 (
  echo Membuka phpMyAdmin: http://localhost/phpmyadmin/index.php?route=/database/structure^&db=portal_hr
  start "" "http://localhost/phpmyadmin/index.php?route=/database/structure&db=portal_hr"
  exit /b 0
)

echo Apache XAMPP belum jalan, jadi phpMyAdmin tidak tersedia.
echo Membuka Prisma Studio di http://localhost:5555 (tutup jendela ini untuk berhenti).
echo (Untuk phpMyAdmin: nyalakan Apache di XAMPP Control Panel, lalu jalankan file ini lagi.)
echo.
call npx prisma studio --port 5555
