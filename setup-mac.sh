#!/usr/bin/env bash
# Portal HR: set up and start a separate test copy on macOS.
#
#   bash setup-mac.sh
#
# First run: installs packages, creates hr-app/.env with fresh keys, starts a local
# database, creates the tables and a test admin, then starts the app.
# Later runs: only start the database and the app again (existing .env and data are kept).
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

# Fixed ports so DATABASE_URL in .env keeps matching across restarts
DB_PORT=51214
SHADOW_PORT=51215
SERVER_PORT=51213

# 2. .env with fresh secrets (never overwrite an existing one)
if [ ! -f .env ]; then
  say "Membuat .env dengan kunci baru…"
  secret() { node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))'; }
  cat > .env <<EOF
# Local test copy on this Mac. Never commit or share this file.
DATABASE_URL="postgres://postgres:postgres@localhost:${DB_PORT}/template1?sslmode=disable"
SHADOW_DATABASE_URL="postgres://postgres:postgres@localhost:${SHADOW_PORT}/template1?sslmode=disable"
DATABASE_POOL_MAX=1
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

# 3. Packages (first run, or when node_modules is missing)
if [ ! -d node_modules ]; then
  say "Memasang paket (beberapa menit)…"
  npm ci
fi

# 4. Local database
say "Menyalakan database lokal…"
npx prisma dev --name hr-app --detach --port "$SERVER_PORT" --db-port "$DB_PORT" --shadow-db-port "$SHADOW_PORT" >/dev/null 2>&1 || true
if ! npx prisma dev ls 2>/dev/null | grep "hr-app" | grep -q "running"; then
  echo "Database tidak bisa dinyalakan. Coba: npx prisma dev stop hr-app, lalu jalankan script ini lagi."
  exit 1
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
