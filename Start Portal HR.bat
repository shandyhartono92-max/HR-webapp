@echo off
rem Starts Portal HR on this PC: the local database (prisma dev) and the web app.
rem Double-click this file, keep the window open while using the app, close it to stop.
title Portal HR
cd /d "%~dp0hr-app"

echo.
echo === Portal HR ===
echo.
echo [1/2] Menyalakan database lokal...
rem Fixed ports so DATABASE_URL in .env keeps matching. "Already running" is fine.
call npx prisma dev --name hr-app --detach --port 51213 --db-port 51214 --shadow-db-port 51215 >nul 2>&1
call npx prisma dev ls 2>nul | findstr /c:"hr-app" | findstr /c:"running" >nul
if errorlevel 1 (
  echo.
  echo Database tidak bisa dinyalakan. Lihat bagian "Local database notes" di hr-app\README.md.
  pause
  exit /b 1
)

rem A Prisma Studio left open by "Buka Database.bat" (window closed with X) holds the
rem database's only connection, so close it before the app starts
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":5555 .*LISTENING"') do (
  echo Menutup Prisma Studio yang masih terbuka...
  taskkill /PID %%p /T /F >nul 2>&1
)
taskkill /FI "WINDOWTITLE eq Prisma Studio*" /T /F >nul 2>&1

echo [2/2] Menyalakan aplikasi...
echo.
echo Buka dari komputer ini : http://localhost:3000
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do echo Buka dari MacBook/HP   : http://%%b:3000
)
echo (MacBook/HP harus terhubung ke Wi-Fi yang sama dengan komputer ini.)
echo.
call npm run dev
pause
