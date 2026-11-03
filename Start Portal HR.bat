@echo off
rem Starts Portal HR on this PC: the MariaDB database from XAMPP and the web app.
rem Double-click this file, keep the window open while using the app, close it to stop.
rem XAMPP is expected in C:\xampp; set XAMPP_DIR before running if it lives elsewhere.
title Portal HR
cd /d "%~dp0hr-app"
if not defined XAMPP_DIR set "XAMPP_DIR=C:\xampp"

echo.
echo === Portal HR ===
echo.
echo [1/3] Memeriksa database MariaDB (XAMPP)...
if not exist "%XAMPP_DIR%\mysql\bin\mysqladmin.exe" (
  echo.
  echo XAMPP tidak ditemukan di %XAMPP_DIR%. Pasang XAMPP, atau atur XAMPP_DIR.
  pause
  exit /b 1
)
call :db_alive && goto db_ready
rem Prefer the Windows service (set up in XAMPP Control Panel); it needs admin rights to start
sc query mysql >nul 2>&1 && (
  echo       MariaDB belum jalan, menyalakan service "mysql"...
  net start mysql >nul 2>&1
)
call :db_alive && goto db_ready
echo       MariaDB belum jalan, menyalakan di jendela terpisah (jangan tutup jendela itu)...
start "MariaDB (XAMPP) - jangan ditutup" /min "%XAMPP_DIR%\mysql\bin\mysqld.exe" --defaults-file="%XAMPP_DIR%\mysql\bin\my.ini" --standalone
for /l %%i in (1,1,30) do (
  call :db_alive && goto db_ready
  ping -n 2 127.0.0.1 >nul
)
echo.
echo MariaDB tidak bisa dinyalakan. Coba nyalakan MySQL dari XAMPP Control Panel, lalu jalankan file ini lagi.
pause
exit /b 1
:db_ready

echo [2/3] Memperbarui struktur database (jika ada perubahan)...
call npx prisma migrate deploy >nul 2>&1
if errorlevel 1 (
  echo.
  echo Gagal memperbarui database. Jalankan "npx prisma migrate deploy" di folder hr-app untuk melihat pesannya.
  pause
  exit /b 1
)
rem The database client must match the schema, or pages fail after a schema change
call npx prisma generate >nul 2>&1

echo [3/3] Menyalakan aplikasi...
echo.
echo Buka dari komputer ini : http://localhost:3000
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do echo Buka dari MacBook/HP   : http://%%b:3000
)
echo (MacBook/HP harus terhubung ke Wi-Fi yang sama dengan komputer ini.)
echo.
call npm run dev
pause
exit /b 0

rem Asks the server itself whether it is up. "ping" succeeds even when the made-up
rem user is refused, so no password is needed; netstat sometimes missed the port.
:db_alive
"%XAMPP_DIR%\mysql\bin\mysqladmin.exe" --connect-timeout=2 -h 127.0.0.1 -P 3306 -u ping_check --password=x ping >nul 2>&1
exit /b %errorlevel%
