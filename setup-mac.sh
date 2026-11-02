#!/usr/bin/env bash
# Portal HR: set up and start a separate test copy on macOS.
#
#   bash setup-mac.sh
#
# Needs a MySQL/MariaDB server on this Mac at 127.0.0.1:3306, for example:
#   - XAMPP for macOS (start MySQL in its manager app), or
#   - Homebrew: brew install mariadb && brew services start mariadb
# The script logs in as root (no password, XAMPP's default) to create the database
# and its own user. If your root has a password: DB_ROOT_PASSWORD=... bash setup-mac.sh
#
# First run: installs packages, creates the portal_hr database and hr-app/.env with
# fresh keys, creates the tables and a test admin, then starts the app.
# Later runs: only apply new database changes and start the app (data is kept).
#
# This copy has its own empty database. Data on the Windows PC is not copied.
set -euo pipefail

cd "$(dirname "$0")/hr-app"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# 1. Node.js 22+
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js belum terpasang. Unduh versi LTS dari https://nodejs.org lalu jalankan script ini lagi."
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node.js $(node -v) terlalu lama. Pasang versi LTS terbaru dari https://nodejs.org."
  exit 1
fi

# 2. MySQL/MariaDB client and server
MYSQL=""
for candidate in /Applications/XAMPP/xamppfiles/bin/mysql "$(command -v mariadb || true)" "$(command -v mysql || true)"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then MYSQL="$candidate"; break; fi
done
if [ -z "$MYSQL" ]; then
  echo "MySQL/MariaDB tidak ditemukan. Pasang XAMPP for macOS, atau: brew install mariadb && brew services start mariadb"
  exit 1
fi
root_sql() {
  if [ -n "${DB_ROOT_PASSWORD:-}" ]; then
    "$MYSQL" -h 127.0.0.1 -P 3306 -u root -p"$DB_ROOT_PASSWORD" "$@"
  else
    "$MYSQL" -h 127.0.0.1 -P 3306 -u root "$@"
  fi
}
if ! root_sql -e "SELECT 1" >/dev/null 2>&1; then
  echo "Tidak bisa masuk ke MySQL/MariaDB di 127.0.0.1:3306 sebagai root."
  echo "Pastikan server MySQL sudah jalan (XAMPP: tombol Start pada MySQL). Kalau root punya password:"
  echo "  DB_ROOT_PASSWORD=passwordnya bash setup-mac.sh"
  exit 1
fi

# 3. Database, user and .env with fresh secrets (never overwrite an existing .env)
if [ ! -f .env ]; then
  say "Membuat database portal_hr dan .env dengan kunci baru…"
  secret() { node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))'; }
  DB_PASSWORD="$(node -e 'console.log(require("crypto").randomBytes(18).toString("hex"))')"
  root_sql <<SQL
CREATE DATABASE IF NOT EXISTS portal_hr CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS portal_hr_shadow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'portal_hr'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
CREATE USER IF NOT EXISTS 'portal_hr'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER 'portal_hr'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER 'portal_hr'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON portal_hr.* TO 'portal_hr'@'localhost', 'portal_hr'@'127.0.0.1';
GRANT ALL PRIVILEGES ON portal_hr_shadow.* TO 'portal_hr'@'localhost', 'portal_hr'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
  cat > .env <<EOF
# Local test copy on this Mac. Never commit or share this file.
DATABASE_URL="mysql://portal_hr:${DB_PASSWORD}@127.0.0.1:3306/portal_hr"
SHADOW_DATABASE_URL="mysql://portal_hr:${DB_PASSWORD}@127.0.0.1:3306/portal_hr_shadow"
SESSION_SECRET="$(secret)"
ENCRYPTION_KEY="$(secret)"

# Test login created by the seed (local test copy only)
SEED_ADMIN_EMAIL="admin@admin.com"
SEED_ADMIN_PASSWORD="admin"

# Letterhead on generated letters (sample values)
COMPANY_NAME="PT Contoh Sejahtera"
COMPANY_ADDRESS="Jl. Contoh No. 1, Bandung"
COMPANY_CITY="Bandung"
LETTER_SIGNATORY_NAME="Nama Manajer HR"
LETTER_SIGNATORY_TITLE="HR Manager"

# Optional: AI CV screening and interview guides
# ANTHROPIC_API_KEY=""
EOF
  FIRST_RUN=1
else
  FIRST_RUN=0
fi

# 4. Packages (first run, or when node_modules is missing)
if [ ! -d node_modules ]; then
  say "Memasang paket (beberapa menit)…"
  npm ci
fi

# 5. Tables and test data
say "Menyiapkan tabel database…"
npx prisma migrate deploy
if [ "$FIRST_RUN" = "1" ]; then
  say "Mengisi data contoh dan akun admin tes…"
  npm run db:seed
fi

# 6. Start
say "Aplikasi siap. Buka http://localhost:3000 (login: admin@admin.com / admin)."
echo "Tekan Ctrl+C untuk berhenti. Untuk menyalakan lagi nanti: bash setup-mac.sh"
npm run dev
