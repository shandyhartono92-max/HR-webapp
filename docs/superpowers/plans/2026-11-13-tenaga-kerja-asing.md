# Tenaga Kerja Asing (TKA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A foreign-worker list per location with KITAS expiry alerts (menu badge, list banner, in-app notifications 30 days before and at expiry).

**Architecture:** New `ForeignWorker` model in the location schema (`prisma/schema.prisma`), deployed to every location with `npm run db:migrate:sites`. Pure rules in `src/lib/foreign-workers.ts` (validation, alert level, which notice is due); pages under `/dashboard/tka`; the hourly background job gains a KITAS notice step per location.

**Tech Stack:** Next.js 16 App Router + server actions, Prisma 7 + MariaDB, zod v4.

**Spec:** `docs/superpowers/specs/2026-11-13-tenaga-kerja-asing-design.md`

## Global Constraints

- Alerts use **KITAS expiry only**; window **30 days** (`KITAS_ALERT_DAYS = 30`); passport expiry is shown, never alerted.
- Passport and KITAS numbers stored as **plain text**; unique per location (`@unique` in the location schema).
- Status `ACTIVE` ("Aktif") / `INACTIVE` ("Non Aktif"); inactive workers raise no alert or notification. No delete.
- All six fields required: fullName (3–120), passportNumber (max 30), kitasNumber (max 30), passportExpiry, kitasExpiry (dates), location (free text, max 120). Numbers are trimmed and upper-cased.
- Access: ADMIN and HR only (`requireRole("ADMIN", "HR")`). UI copy in Bahasa Indonesia; code comments in English.
- Create forms include `<SiteField />` and the action calls `formSiteRefusal` (two-tab rule).
- Work on branch `tka` in the main checkout (`D:\Claude HR`); the parked OTP files (`.env.example`, `package*.json`, `bank.ts`, `bank-forms.tsx`, `banking.ts`, `mailer.ts`, `check-otp-email.mts`) stay uncommitted and untouched; commit only this feature's files. No push or merge without asking.
- The HR guide gets a TKA section and an FAQ row (Task 5).

## Review Focus

1. KITAS renewed (expiry moved later) after notices were sent → markers cleared, the next cycle notifies again. → Task 4 test `renewal resets notices`.
2. Same passport/KITAS number typed again in the same location → refused with a message; in the other location → allowed. → Task 2 browser test.
3. Non Aktif worker with an expired KITAS → no badge, no banner, no notification. → Task 1 `kitasAlert` test + Task 4 test.
4. A worker added with a KITAS already expired → exactly one "expired" notification, not also a "soon" one. → Task 4 test `already expired gets one notice`.
5. KITAS expiring today → still "soon" (yellow), expired from tomorrow. → Task 1 test.

---

### Task 1: Model and rules

**Files:** Modify `hr-app/prisma/schema.prisma`; create `hr-app/prisma/migrations/20261113120000_foreign_workers/migration.sql`, `hr-app/src/lib/foreign-workers.ts`, `hr-app/scripts/check-foreign-workers.mts`.

**Interfaces — Produces:**
- Model `ForeignWorker { id, fullName VarChar(120), passportNumber VarChar(30) @unique, kitasNumber VarChar(30) @unique, passportExpiry DateTime @db.Date, kitasExpiry DateTime @db.Date, location VarChar(120), status ForeignWorkerStatus @default(ACTIVE), kitasSoonNoticeAt DateTime?, kitasExpiredNoticeAt DateTime?, createdAt, updatedAt; @@index([status, kitasExpiry]); @@map("foreign_worker") }`, enum `ForeignWorkerStatus { ACTIVE INACTIVE }`.
- `KITAS_ALERT_DAYS = 30`; `kitasAlert(kitasExpiry: Date, status: ForeignWorkerStatus, today: Date): { level: "overdue" | "soon" | null; daysLeft: number }`.
- `parseForeignWorker(input: Record<string, unknown>): { ok: true; data: ForeignWorkerInput } | { ok: false; errors: Record<string, string[]> }`.
- `kitasNoticeDue(w: { status; kitasExpiry: Date; kitasSoonNoticeAt: Date | null; kitasExpiredNoticeAt: Date | null }, today: Date): "soon" | "expired" | null`.
- `kitasAlertWhere(today: Date)` — Prisma filter: ACTIVE and kitasExpiry ≤ today + 30 days.
- `foreignWorkerStatusLabel = { ACTIVE: "Aktif", INACTIVE: "Non Aktif" }`.

- [ ] **Step 1: Write `scripts/check-foreign-workers.mts`** with `today = 2026-11-13`:
  - `kitasAlert(2026-12-13, ACTIVE)` → soon/30; `(2026-12-14)` → null/31; `(2026-11-13)` → soon/0 (expires today); `(2026-11-12)` → overdue/−1; `(2026-11-01, INACTIVE)` → null.
  - `parseForeignWorker` valid input → numbers trimmed and upper-cased (`" a1234567 "` → `"A1234567"`), dates parsed; missing each field → that field's error ("Isi nama lengkap.", "Isi nomor paspor.", "Isi nomor KITAS.", "Isi tanggal berlaku paspor.", "Isi tanggal berlaku KITAS.", "Isi lokasi."); name of 2 characters → "Nama minimal 3 karakter."
  - `kitasNoticeDue`: 40 days left → null; 20 days, no markers → "soon"; 20 days, soon marker set → null; expired, no markers → "expired"; expired, only soon marker → "expired"; expired, expired marker set → null; INACTIVE → null.
- [ ] **Step 2:** Run → FAIL (module missing).
- [ ] **Step 3:** Schema + migration (written by hand, checked with `prisma migrate diff`; JSON MODIFY lines are noise), implement the module, `npm run db:migrate:sites`, `npx prisma generate`, restart the dev server.
- [ ] **Step 4:** Run → `check-foreign-workers: ok`; `tsc` clean.
- [ ] **Step 5:** Commit `TKA: model and KITAS alert rules`.

### Task 2: Actions and pages

**Files:** Create `hr-app/src/app/actions/foreign-workers.ts`, `hr-app/src/app/dashboard/tka/page.tsx`, `tka/tambah/page.tsx`, `tka/[id]/page.tsx`, `tka/foreign-worker-form.tsx`.

**Interfaces — Consumes:** Task 1. **Produces:** `createForeignWorker(state, formData)`, `updateForeignWorker(id, state, formData)`, `setForeignWorkerStatus(id, status)`.

- [ ] **Step 1: Browser test first (scratchpad script):** add a worker in Batam → redirect to the list with "TKA ditambahkan."; the row shows passport, KITAS, both dates, lokasi, "Aktif"; same passport again → "Nomor paspor ini sudah dipakai TKA lain."; same KITAS → "Nomor KITAS ini sudah dipakai TKA lain."; the same numbers in Jakarta → saved (Review Focus 2); edit → new KITAS date saved; set Non Aktif → hidden under the default "Aktif" filter, shown under "Non Aktif"; 375 px wide, no horizontal scroll.
- [ ] **Step 2:** Run → FAIL (404).
- [ ] **Step 3:** Implement. Create: `formSiteRefusal`, `parseForeignWorker`, unique-clash → field errors above, audit `foreign_worker.created` (field names only), `redirect("/dashboard/tka?ditambah=1")`. Update: same checks; when `kitasExpiry` changes, clear both notice markers; audit `foreign_worker.updated`. Status: audit `foreign_worker.status_changed`; `revalidatePath("/dashboard", "layout")` after each write (menu badge). List: filter chips Aktif / Non Aktif / Semua (`?status=aktif|nonaktif|semua`, default aktif), sorted by kitasExpiry ascending; KITAS cell shows date + the contract-style alert badge; banner when any active worker is alerted ("N KITAS habis dalam 30 hari, termasuk M yang sudah lewat." + "Lihat daftarnya" → `?kitas=habis`).
- [ ] **Step 4:** Run → pass; tsc, lint clean.
- [ ] **Step 5:** Commit `TKA: list, add, edit and status`.

### Task 3: Menu entry and badge

**Files:** Modify `hr-app/src/lib/nav.ts`, `hr-app/scripts/check-nav.mts`, `hr-app/src/app/dashboard/layout.tsx`, `hr-app/src/lib/foreign-workers.ts` (server part: `countKitasAlerts()` in a new `src/lib/foreign-workers-db.ts`).

- [ ] **Step 1:** check-nav: HR and ADMIN see "Tenaga Kerja Asing" in the Karyawan group after "Karyawan"; EMPLOYEE and HIRING_MANAGER do not; `activeHref("/dashboard/tka/abc")` → `/dashboard/tka`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Nav item `{ href: "/dashboard/tka", label: "Tenaga Kerja Asing", icon: "globe" (add the icon if missing, else reuse "users"), roles: HR_ONLY }`; layout badge `badges["/dashboard/tka"] = await countKitasAlerts()`.
- [ ] **Step 4:** Run → ok; browser: the badge count equals the banner count.
- [ ] **Step 5:** Commit `TKA: menu entry with KITAS badge`.

### Task 4: KITAS notifications

**Files:** Create `hr-app/src/lib/kitas-job.ts`, `hr-app/scripts/check-kitas-job.mts`; modify `hr-app/src/lib/background-jobs.ts`.

**Interfaces — Produces:** `notifyKitasExpiry(today = todayDate()): Promise<{ soon: number; expired: number }>` (current location via `siteDb()`).

- [ ] **Step 1: Write `check-kitas-job.mts`** (runs in `withSite("jakarta")` with throwaway workers prefixed `UJI-KITAS`, removed at the end; asserts on notifications to active HR/ADMIN mirrors of Jakarta): 20 days left → one "soon" per staff user, second run → no new ones; already expired, no markers → one "expired" only (`already expired gets one notice`); INACTIVE expired → none; `renewal resets notices`: after a soon notice, update kitasExpiry through the same helper the action uses (`kitasRenewalData`) → markers null → next run notifies again.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement: notices type `kitas_soon` / `kitas_expired`, title "KITAS segera habis" / "KITAS sudah habis", body "<Nama> · KITAS <nomor> berlaku sampai <tanggal>." (name first, as retention expects), link `/dashboard/tka/<id>`; set the marker in the same transaction as the notifications. In `background-jobs.ts`, run it for every location after the training step, each in try/catch with `[kitas:<code>]` logs.
- [ ] **Step 4:** Run → `check-kitas-job: ok`; all checks, tsc, lint.
- [ ] **Step 5:** Commit `TKA: KITAS notifications from the hourly job`.

### Task 5: Guide and full retest

- [ ] **Step 1:** Browser pass in both locations at desktop and 375 px: Review Focus 1–5, list/add/edit/status, badge and banner, a notification appearing on Ringkasan after the job runs (restart the dev server to trigger it).
- [ ] **Step 2:** All check scripts, tsc, lint green; remove test workers and notifications.
- [ ] **Step 3:** HR guide (doc 4816dda8-619c-445e-9af3-d2968b259034): section "Tenaga Kerja Asing" (purpose, add/edit, Non Aktif, KITAS alerts 30 days, notifications on Ringkasan), a screenshot of the list, an FAQ row ("KITAS sudah diperpanjang tapi peringatan masih muncul" → ubah tanggal berlaku KITAS di data TKA).
- [ ] **Step 4:** Report; ask before merging `tka` into main and before pushing.
