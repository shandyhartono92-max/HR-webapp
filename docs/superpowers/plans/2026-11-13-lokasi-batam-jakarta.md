# Lokasi Batam dan Jakarta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Portal HR app serving Batam and Jakarta from two location databases with the same schema, plus one accounts database that holds passwords and per-location access.

**Architecture:** `portal_hr_akun` (new Prisma schema, own client) holds `Account`, `SiteAccess`, `LoginEvent`. `portal_hr` (Batam) and `portal_hr_jakarta` share `prisma/schema.prisma`; their `User` becomes a password-less mirror kept in sync from the accounts database. Every request resolves its location from the signed session (or from an explicit `withSite()` scope for jobs, the careers page and scripts) and gets that location's Prisma client from `siteDb()`.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7 + MariaDB (XAMPP) via `@prisma/adapter-mariadb`, zod v4, jose, bcryptjs, Node `AsyncLocalStorage`.

**Spec:** `docs/superpowers/specs/2026-11-13-lokasi-batam-jakarta-design.md`

## Global Constraints

- Location codes: `batam`, `jakarta`; labels "Batam", "Jakarta". The current `portal_hr` is Batam; Jakarta starts empty.
- Env names: `SITES`, `SITE_LABEL_<CODE>`, `DATABASE_URL_<CODE>`, `COMPANY_NAME_<CODE>`, `COMPANY_ADDRESS_<CODE>`, `COMPANY_CITY_<CODE>`, `LETTER_SIGNATORY_NAME_<CODE>`, `LETTER_SIGNATORY_TITLE_<CODE>`, `ACCOUNTS_DATABASE_URL`, `ACCOUNTS_SHADOW_DATABASE_URL` (`<CODE>` upper case).
- Roles per location: `ADMIN | HR | HIRING_MANAGER | EMPLOYEE` (the existing `Role` enum values).
- UI copy is Bahasa Indonesia; code comments English. Exact messages: "Email atau kata sandi salah." (unchanged), "Akun ini tidak punya akses ke {Label}.", with " Akun ini terdaftar di {Other}." appended when the account has access to exactly one other location.
- Never print or commit secrets (`.env`, DB passwords, `SESSION_SECRET`, `ENCRYPTION_KEY`). `.env` and `storage/` are never committed; backups go outside the repo.
- The parked OTP work (uncommitted changes in `.env.example`, `package*.json`, `src/app/actions/bank.ts`, `src/app/dashboard/rekening/bank-forms.tsx`, `src/lib/banking.ts`, untracked `src/lib/mailer.ts`, `scripts/check-otp-email.mts`) must stay out of every commit. Work happens in a git worktree on branch `lokasi-batam-jakarta`, so the main checkout and its parked changes are not touched. Nothing is pushed or merged without asking the user.
- Migrations are hand-written and checked with `prisma migrate diff`; the dev server is restarted after `prisma generate`.
- Check scripts follow the repo pattern: `scripts/check-<name>.mts`, run with `npx tsx --conditions=react-server --env-file=.env scripts/check-<name>.mts`, print `check-<name>: ok`.
- Every user-visible change also updates the HR and employee guides (Task 11).

## Review Focus

1. A browser holding a session cookie from before this change (no `site`) must land on the login page, not an error page. → Task 2 test `old session without site is rejected`.
2. An account given access to Jakarta that has never logged in there must still appear in Jakarta's interviewer and hiring-manager pickers. → Task 7 test: granting access creates the mirror at once.
3. Changing an employee's email on the profile to an email another account already uses must be refused with a message, in any location. → Task 7 test `profile email clash checks accounts`.
4. One location database being down must not block login to the other, nor the careers page of the other. → Task 5 and Task 9 tests with an unreachable `DATABASE_URL_JAKARTA`.
5. Switching location when access to the target was removed after login must be refused and keep the current session. → Task 6 test `switch refused after access removed`.

---

### Task 0: Backup, worktree and new databases (with the user)

No code. Needs the user once, for MariaDB root.

- [ ] **Step 1:** Create the worktree with superpowers:using-git-worktrees: branch `lokasi-batam-jakarta` from `main`, folder `D:\Claude HR\.worktrees\lokasi`. Copy `hr-app/.env` into it (never commit), `npm install` in `hr-app`, add a `.claude/launch.json` entry `hr-app-lokasi` on port 3001.
- [ ] **Step 2:** Back up `portal_hr`: `C:\xampp\mysql\bin\mysqldump.exe` with the credentials from `.env` passed via `--defaults-extra-file` (a temp file in the scratchpad, deleted after) into `D:\Claude HR backups\2026-11-13-portal_hr.sql` (outside the repo). Expected: file size > 0 and it ends with `-- Dump completed`.
- [ ] **Step 3:** Give the user the SQL to run as root (phpMyAdmin or `mysql -u root`): `CREATE DATABASE portal_hr_akun`, `portal_hr_akun_shadow`, `portal_hr_jakarta` (utf8mb4), and `GRANT ALL` on each to the app user. Wait for "sudah". Expected: connecting with the app user to each database works.
- [ ] **Step 4:** In the worktree `.env` add the new variables (Global Constraints), `DATABASE_URL_BATAM` = today's `DATABASE_URL`, today's `COMPANY_*`/`LETTER_SIGNATORY_*` copied to the `_BATAM` names, Jakarta company values left as the placeholders the user fills later. Keep `DATABASE_URL` (Prisma CLI for the site schema reads it).

### Task 1: Site configuration

**Files:**
- Create: `hr-app/src/lib/sites.ts`, `hr-app/scripts/check-sites.mts`
- Modify: `hr-app/.env.example` (new block; in the worktree it has no OTP changes)

**Interfaces:**
- Produces: `type SiteCode = string`; `type Site = { code: SiteCode; label: string; databaseUrl: string; company: { name: string; address: string; city: string; signatoryName: string; signatoryTitle: string } }`; `parseSites(env: Record<string, string | undefined>): { ok: true; sites: Site[] } | { ok: false; missing: string[] }`; `sites(): Site[]` (from `process.env`, throws with the missing names); `siteByCode(code: unknown): Site | null`; `defaultSite(): Site` (first in `SITES`).

- [ ] **Step 1: Write `scripts/check-sites.mts`** asserting:
  - `parseSites({ SITES: "batam,jakarta", SITE_LABEL_BATAM: "Batam", DATABASE_URL_BATAM: "mysql://u:p@h/a", ...jakarta })` → ok, codes `["batam","jakarta"]`, labels, company fields; blank company values fall back to the same placeholders `companyInfo()` uses today (`"[Nama Perusahaan]"` etc.).
  - Missing `DATABASE_URL_JAKARTA` → `{ ok: false, missing: ["DATABASE_URL_JAKARTA"] }`; missing `SITES` → `missing: ["SITES"]`.
  - `SITES: " Batam , jakarta "` → codes trimmed and lower-cased.
  - `siteByCode("jakarta")` / `siteByCode("medan")` / `siteByCode(undefined)` with a stubbed env → site / null / null.
- [ ] **Step 2:** Run it. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `src/lib/sites.ts` (no `server-only`, pure apart from reading `process.env` in `sites()`).
- [ ] **Step 4:** Run it. Expected: `check-sites: ok`.
- [ ] **Step 5:** Commit `Sites: configuration for Batam and Jakarta`.

### Task 2: Site context, database routing and session site

**Files:**
- Create: `hr-app/src/lib/site-context.ts`, `hr-app/scripts/check-site-session.mts`
- Modify: `hr-app/src/lib/db.ts`, `hr-app/src/lib/session-token.ts`, `hr-app/src/proxy.ts`, `hr-app/src/app/actions/auth.ts` (login stores `site: defaultSite().code` until Task 5)

**Interfaces:**
- Consumes: Task 1 `siteByCode`, `defaultSite`, `Site`.
- Produces:
  - `site-context.ts`: `withSite<T>(site: SiteCode, fn: () => Promise<T>): Promise<T>` (AsyncLocalStorage); `scopedSite(): SiteCode | undefined`.
  - `db.ts`: `dbFor(site: SiteCode): PrismaClient` (one cached client per site, kept on `globalThis` in dev); `currentSite(): Promise<Site>` (scope first, then session, else throws `Error("Lokasi belum dipilih")`); `siteDb(): Promise<PrismaClient>` = `dbFor((await currentSite()).code)`. The exported `db` constant is removed.
  - `SessionPayload = { userId: string; role: Role; site: SiteCode }`; `readSession` returns `null` when `site` is missing or not configured.

- [ ] **Step 1: Write `scripts/check-site-session.mts`** asserting: a signed `{userId, role, site: "batam"}` reads back with `site`; `old session without site is rejected` (token signed without `site` → `null`); unknown site `"medan"` → `null`; `withSite("jakarta", async () => scopedSite())` → `"jakarta"`, and nested `withSite("batam")` inside it → `"batam"`, and outside any scope → `undefined`; `dbFor("batam") === dbFor("batam")` (same instance) and `dbFor("medan")` throws.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement. `currentSite()` reads the cookie via `cookies()` only when no scope is set. `proxy.ts` already sends a `null` session to `/login` and drops the cookie; confirm it covers the missing-site case (it calls `readSession`).
- [ ] **Step 4:** Run it. Expected: `check-site-session: ok`. `npx tsc --noEmit` still fails only on the `db` import sites Task 3 converts.
- [ ] **Step 5:** Commit together with Task 3 (the app does not compile in between).

### Task 3: Every database user goes through the location

**Files:** the 47 importers of `@/lib/db` (list: `grep -rl 'from "@/lib/db"' src`), plus `src/lib/background-jobs.ts`, `src/lib/storage.ts`, `scripts/retention.ts`.

**Interfaces:**
- Consumes: Task 2 `siteDb`, `dbFor`, `withSite`, `currentSite`.
- Produces: `saveFile(folder, data, ext)` now writes keys `"<site>/<folder>/<uuid>.<ext>"` (site from `currentSite()`); `readFile`/`deleteFile` unchanged (keys are full relative paths, old Batam keys keep working).

- [ ] **Step 1:** Replace `import { db } from "@/lib/db"` with `import { siteDb } from "@/lib/db"` and add `const db = await siteDb();` at the top of each function that uses it (pages, routes, actions, lib functions). Functions that receive a transaction client keep it. Logic unchanged.
- [ ] **Step 2:** `background-jobs.ts`: run `graduateTrainees` for every `sites()` entry inside `withSite(code, …)`; log lines prefixed `[training:<code>]`; a failure in one site is logged and the loop continues.
- [ ] **Step 3:** `scripts/retention.ts`: loop over `sites()` with `withSite`, print counts per site.
- [ ] **Step 4:** Careers pages and `apply.ts` (public, no session): wrap their work in `withSite(defaultSite().code, …)` for now; Task 9 replaces this.
- [ ] **Step 5:** Verify: `npx tsc --noEmit` clean, `npx eslint src scripts` clean, all `check-*.mts` (except the parked otp one) print ok; worktree dev server: login as admin, open Dashboard, Karyawan, a profile, Kandidat, Surat, `/karir` — same data as before. `grep -rn 'from "@/lib/db"' src | grep -v siteDb\|dbFor\|accountsDb` → nothing.
- [ ] **Step 6:** Commit Tasks 2+3: `Locations: route every query through the session's location`.

### Task 4: Accounts database and the account split

**Files:**
- Create: `hr-app/prisma/accounts/schema.prisma`, `hr-app/prisma/accounts/migrations/20261113090000_init/migration.sql`, `hr-app/prisma.accounts.config.ts`, `hr-app/src/lib/accounts-db.ts`, `hr-app/scripts/split-accounts.mts`, `hr-app/scripts/check-split-accounts.mts`
- Modify: `hr-app/package.json` scripts (`postinstall` generates both clients; `db:migrate:accounts`), `.gitignore` if the second generated folder needs it

**Interfaces:**
- Produces: generated client at `src/generated/accounts`; `accountsDb` (`server-only`, adapter from `ACCOUNTS_DATABASE_URL` via `mariadbConfig`); models `Account { id String @id (cuid, not defaulted when copied), email String @unique, name, passwordHash, mustChangePassword Boolean, isActive Boolean, lastLoginAt DateTime?, createdAt }`, `SiteAccess { id, accountId, site String @db.VarChar(20), role Role, createdAt; @@unique([accountId, site]) }`, `LoginEvent { id, accountId String?, site String?, kind LoginEventKind (LOGIN | LOGOUT | SWITCH | FAILED), createdAt }`; `splitAccounts(from: PrismaClient, to: AccountsClient, site: SiteCode): Promise<{ copied: number; existing: number; total: number }>` exported from `src/lib/account-split.ts` (the script is a thin wrapper).

- [ ] **Step 1: Write `scripts/check-split-accounts.mts`** against `portal_hr_akun_shadow` (reset at start): given a fake source of 3 users (one inactive, one with `mustChangePassword`), `splitAccounts` → `{copied: 3, existing: 0, total: 3}`, ids/email/hash/flags equal, each has `SiteAccess` batam with the source role; run again → `{copied: 0, existing: 3, total: 3}`, still 3 `SiteAccess` rows.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Write the schema and migration (check with `prisma migrate diff --config prisma.accounts.config.ts`), deploy to `portal_hr_akun`, generate, implement `accounts-db.ts`, `account-split.ts`, `split-accounts.mts` (reads `DATABASE_URL_BATAM`, prints the three counts).
- [ ] **Step 4:** Run the check → `check-split-accounts: ok`. Run `split-accounts.mts` for real → `total` equals `SELECT COUNT(*) FROM portal_hr.User`.
- [ ] **Step 5:** Commit `Accounts: database for logins and per-location access`.

### Task 5: Login with a location, mirror sync, passwords in the accounts database

**Files:**
- Create: `hr-app/src/lib/site-access.ts`, `hr-app/scripts/check-site-access.mts`, `hr-app/scripts/migrate-sites.mts`, `hr-app/prisma/migrations/20261113100000_user_mirror/migration.sql`
- Modify: `prisma/schema.prisma` (`User` drops `passwordHash`, `mustChangePassword`, `twoFactorEnabled`, `lastLoginAt`), `src/app/actions/auth.ts`, `src/app/login/page.tsx`, `src/app/login/login-form.tsx`, `src/lib/dal.ts`, `src/app/actions/accounts.ts` (`changePassword`), `src/app/dashboard/akun/*` if it reads removed fields

**Interfaces:**
- Consumes: Task 1–4.
- Produces (`site-access.ts`): `accessError(access: { site: SiteCode }[], wanted: SiteCode, labelOf: (c: SiteCode) => string): string | null` (pure: null, or the exact Global Constraints message); `syncMirror(accountId: string, site: SiteCode): Promise<void>` (upsert the site `User` by id with name, email, role from `SiteAccess`, `isActive` = account active and access exists; sets inactive when access is gone); `logLogin(kind, accountId | null, site | null)`.
- `getCurrentUser()` returns the same shape as today; `mustChangePassword` and the active check come from `Account`, role from the site mirror.

- [ ] **Step 1: Write `scripts/check-site-access.mts`**: `accessError([{site:"batam"}], "batam")` → null; `accessError([{site:"batam"}], "jakarta")` → "Akun ini tidak punya akses ke Jakarta. Akun ini terdaftar di Batam."; `accessError([], "jakarta")` → "Akun ini tidak punya akses ke Jakarta."; two other sites → no "terdaftar" sentence.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `site-access.ts`. Login action: zod adds `site` (must be a configured code); account lookup and bcrypt in `accountsDb`; wrong email/password → existing message + `logLogin("FAILED", accountId|null, site)`; then `accessError`; then `syncMirror`, `lastLoginAt` on `Account`, audit `auth.login` in the site, `createSession({userId, role, site})`. A site whose database is unreachable → "Lokasi Jakarta sedang tidak bisa diakses. Coba lagi nanti." without affecting other sites. Login form: a required select of `sites()` labels above email, remembered in a `last_site` cookie (not httpOnly-sensitive, value = code only). `changePassword` reads/writes `Account`. `logout` calls `logLogin("LOGOUT", userId, site)` before deleting the session.
- [ ] **Step 4:** Mirror migration: drop the four columns. `migrate-sites.mts`: for each site runs `prisma migrate deploy` with `DATABASE_URL` set to that site's URL; before deploying a site whose pending migrations include `20261113100000_user_mirror`, it refuses (exit 1, names the missing ids) unless every `User.id` in that site exists in `Account`.
- [ ] **Step 5:** Run `check-site-access` → ok; `migrate-sites.mts` on Batam → applied; restart the worktree dev server. Browser: login Batam as admin → dashboard; same with Jakarta chosen → "Akun ini tidak punya akses ke Jakarta. Akun ini terdaftar di Batam."; wrong password → old message; with `DATABASE_URL_JAKARTA` pointing to a closed port, Batam login still works (Review Focus 4). `LoginEvent` rows present. Change password works and old password fails.
- [ ] **Step 6:** Commit `Login: choose a location; passwords live in the accounts database`.

### Task 6: Switch location from the header

**Files:**
- Create: `hr-app/src/app/actions/site-switch.ts`, `hr-app/src/app/ui/site-switch.tsx`
- Modify: `hr-app/src/app/dashboard/layout.tsx`, `src/app/ui/nav-drawer.tsx` (mobile)

**Interfaces:**
- Consumes: `accessError`, `syncMirror`, `logLogin`, `createSession`, `currentSite`.
- Produces: `switchSite(target: SiteCode): Promise<{ error?: string }>` (redirects to `/dashboard` on success).

- [ ] **Step 1: Test first (browser script, scratchpad):** admin with access to both: header shows "Batam" and a "Pindah ke Jakarta" control; clicking lands on the Jakarta dashboard with Jakarta data; `switch refused after access removed`: delete the Jakarta `SiteAccess` row, click → message "Akun ini tidak punya akses ke Jakarta." and the session stays on Batam.
- [ ] **Step 2:** Run it. Expected: FAIL (no control).
- [ ] **Step 3:** Implement; users with one site see the label only; logs `SWITCH`; audit `auth.switch_site` in the target site.
- [ ] **Step 4:** Run it → pass; also at 375px width the control is reachable in the drawer without horizontal scroll.
- [ ] **Step 5:** Commit `Header: show and switch the active location`.

### Task 7: Accounts and access management (Pengguna, employee logins, profile, retention)

**Files:**
- Create: `hr-app/src/lib/account-admin.ts`, `hr-app/scripts/check-account-admin.mts`
- Modify: `src/app/actions/users.ts`, `src/app/dashboard/pengguna/page.tsx`, `src/app/dashboard/pengguna/user-forms.tsx`, `src/app/actions/accounts.ts` (`issueEmployeeLogin`), `src/app/actions/employee-profile.ts` (email change, closing the login, last-admin check), `src/lib/retention.ts`

**Interfaces:**
- Consumes: `accountsDb`, `syncMirror`, `sites()`.
- Produces (`account-admin.ts`): `lastAdminError(access: { accountId: string; site: SiteCode; role: Role }[], change: { accountId: string; site: SiteCode; role: Role | null }, actorId: string): string | null` (pure; refuses when the change removes the actor's own last ADMIN access anywhere); `setAccess(accountId, site, role | null)` (writes `SiteAccess`, then `syncMirror` for that site at once — Review Focus 2); `emailTakenBy(email, exceptAccountId?)`.

- [ ] **Step 1: Write `scripts/check-account-admin.mts`** for `lastAdminError`: actor ADMIN only in batam removing (or demoting) own batam ADMIN → "Tidak bisa mencabut akses ADMIN terakhir milik Anda sendiri."; actor ADMIN in both, removing batam → null; changing another account → null.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement. Pengguna page lists `Account`s with one role select per site ("Tidak ada akses" + roles), create account (temp password as today, chosen access), reset password, deactivate (Account `isActive`, mirrors synced in every site). `issueEmployeeLogin`: find or create the `Account` by employee email, `setAccess(…, currentSite, "EMPLOYEE")` (keeps a higher existing role), link `Employee.userId`. Profile email change: refuse with "Email ini sudah dipakai akun lain." when `emailTakenBy` finds another account (`profile email clash checks accounts`, Review Focus 3); otherwise update `Account` and this site's mirror. Closing an employee's login removes this site's `SiteAccess` (mirror inactive). Retention anonymisation: remove this site's access; anonymise the `Account` too when it has no access left.
- [ ] **Step 4:** Check → ok; browser: grant Jakarta HR to `hr2` → in Jakarta the interviewer picker lists hr2 before hr2 ever logged into Jakarta; profile email clash message; employee login issued in Batam has only Batam access.
- [ ] **Step 5:** Commit `Pengguna: accounts with access per location`.

### Task 8: Letters per PT

**Files:** Modify `src/lib/letters/service.ts`, `src/lib/letters/vars.ts`, `src/app/actions/letters.ts`, `src/app/dashboard/surat/page.tsx`, `src/app/dashboard/surat/template/page.tsx`; extend `scripts/check-sites.mts`.

**Interfaces:**
- Produces: `companyInfo(site: Site)` returning `site.company`; `dateLine(date: Date, site: Site)`. Callers pass `await currentSite()`.

- [ ] **Step 1:** Add to `check-sites.mts`: Jakarta company values come back for `siteByCode("jakarta")` and differ from Batam's.
- [ ] **Step 2:** Run → FAIL only if the assertion is new; then implement the signature change.
- [ ] **Step 3:** The "belum diatur" notice on Surat names the per-site variables, e.g. `COMPANY_NAME_JAKARTA`.
- [ ] **Step 4:** Browser: issue a Surat Keterangan Kerja in each site; the PDF header and city line show that site's PT. Letter numbers start at 001 in Jakarta.
- [ ] **Step 5:** Commit `Letters: company and signatory per location`.

### Task 9: Combined careers page

**Files:**
- Create: `hr-app/src/app/karir/[site]/[slug]/page.tsx` (moved from `[slug]`), `apply-form.tsx` moved alongside, `hr-app/src/lib/careers.ts`
- Modify: `src/app/karir/page.tsx`, `src/app/karir/[slug]/page.tsx` (becomes a redirect), `src/app/actions/apply.ts`

**Interfaces:**
- Produces: `openJobsAllSites(): Promise<{ jobs: (Job & { site: SiteCode; siteLabel: string })[]; unavailable: string[] }>` (each site in `withSite`, errors collected per site); `applyToJob` takes `site` from a hidden field validated with `siteByCode`.

- [ ] **Step 1: Test first (browser script):** `/karir` lists Batam jobs with label "Batam"; a Jakarta job created in Jakarta appears with "Jakarta"; `?lokasi=jakarta` filters; `/karir/<old-slug>` redirects to `/karir/batam/<old-slug>`; an application on a Jakarta job lands in `portal_hr_jakarta` (DB check); with Jakarta's URL pointing to a closed port, `/karir` still lists Batam and shows "Lowongan Jakarta sedang tidak bisa ditampilkan." (Review Focus 4).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; job links and share links use `/karir/<site>/<slug>`; dashboard job pages link to the new URL.
- [ ] **Step 4:** Run → pass; CV files of the Jakarta application are under `storage/jakarta/`.
- [ ] **Step 5:** Commit `Karir: one page for both locations`.

### Task 10: Jakarta database, seed and backups

**Files:** Create `hr-app/scripts/backup.mts`; modify `prisma/seed.ts`, `package.json` (`db:migrate:sites`, `backup`), `.env.example`.

- [ ] **Step 1:** `migrate-sites.mts` → Jakarta gets every migration; `prisma migrate status` against Jakarta: up to date.
- [ ] **Step 2:** `seed.ts`: admin is an `Account` with `ADMIN` access to every site (mirrors synced); demo departments, jobs and candidates go to Batam only.
- [ ] **Step 3:** `backup.mts`: mysqldump of `ACCOUNTS_DATABASE_URL` and every site URL into `<BACKUP_DIR>/<YYYY-MM-DD-HHmm>/<db>.sql` (`BACKUP_DIR` from env, required, must be outside the repo), credentials via a temp defaults file deleted afterwards. Run it → three files, each ending with `-- Dump completed`.
- [ ] **Step 4:** Commit `Jakarta database, seed and backup script`.

### Task 11: Guides and the full retest

- [ ] **Step 1:** Full browser pass on the worktree server, desktop and 375px: Review Focus 1–5, the Task 5–9 scenarios again, and the old flows (add employee, import, hire, letters, bank request) in both sites with data never crossing.
- [ ] **Step 2:** All check scripts, `tsc`, lint green.
- [ ] **Step 3:** HR guide (doc 4816dda8-619c-445e-9af3-d2968b259034): login with a location, switching, Pengguna access per location, letters per PT, careers links. Employee guide (doc 49a91430-bee5-4246-8fd1-06a6b880f8db): choosing the location at login. Fresh screenshots of the login page and header.
- [ ] **Step 4:** Report to the user and ask before merging into `main` (the main checkout's parked OTP changes touch `bank.ts`/`banking.ts`, which Task 3 also changed: the merge needs the OTP work stashed and re-applied, with the user's OK) and before pushing.
