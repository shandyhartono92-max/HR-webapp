@echo off
rem Opens Prisma Studio (a database viewer in the browser) for the local database.
rem The local database (prisma dev) accepts only one connection, so this stops
rem Portal HR first and starts it again when you are done.
title Buka Database
cd /d "%~dp0hr-app"

echo.
echo === Buka Database (Prisma Studio) ===
echo.
echo [1/3] Mematikan Portal HR sementara...
taskkill /FI "WINDOWTITLE eq Portal HR*" /T /F >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":3000 .*LISTENING"') do taskkill /PID %%p /T /F >nul 2>&1

echo [2/3] Menyalakan database lokal...
call npx prisma dev --name hr-app --detach --port 51213 --db-port 51214 --shadow-db-port 51215 >nul 2>&1
call npx prisma dev ls 2>nul | findstr /c:"hr-app" | findstr /c:"running" >nul
if errorlevel 1 (
  echo.
  echo Database tidak bisa dinyalakan. Lihat bagian "Local database notes" di hr-app\README.md.
  pause
  exit /b 1
)
rem Give the database a moment to release the app's old connection
ping -n 4 127.0.0.1 >nul

echo [3/3] Membuka Prisma Studio di browser: http://localhost:5555
start "Prisma Studio" /min cmd /c "npx prisma studio --port 5555"
echo.
echo  - Kalau muncul "Could not load schema metadata", klik Retry.
echo  - NIK/NPWP/BPJS/rekening tampil terenkripsi (v1.xxx). Lihat isinya lewat aplikasi.
echo  - Hati-hati mengubah atau menghapus data di Studio: langsung tersimpan, tanpa audit log.
echo.
echo Selesai melihat database? Tekan tombol apa saja di jendela ini
echo untuk menutup Studio dan menyalakan Portal HR lagi.
echo (Kalau jendela ini terlanjur ditutup dengan X, jalankan saja "Start Portal HR.bat":
echo  Studio yang tertinggal akan ditutup otomatis.)
pause >nul

echo.
echo Menutup Prisma Studio...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":5555 .*LISTENING"') do taskkill /PID %%p /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Prisma Studio*" /T /F >nul 2>&1
ping -n 3 127.0.0.1 >nul

echo Menyalakan Portal HR lagi (jendela baru)...
start "" "%~dp0Start Portal HR.bat"
