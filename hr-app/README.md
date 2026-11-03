# Portal HR

Internal HR web app: hiring, CV screening, HR documents and employee bank data.
UI in Bahasa Indonesia. Database design: [SCHEMA.md](SCHEMA.md).

**Stack:** Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · MariaDB / MySQL (XAMPP) · Prisma 7 (`@prisma/adapter-mariadb`) · jose (session cookie) · bcrypt · zod

## Run locally

Requires Node.js 22+ and MariaDB/MySQL (on this PC: XAMPP in `C:\xampp`, database `portal_hr`, user `portal_hr`). On Windows just double-click `Start Portal HR.bat`; by hand:

```bash
npm install
cp .env.example .env        # then fill in the values (see below)
npx prisma migrate deploy   # creates/updates the tables
npm run db:seed             # first time only
npm run dev
```

A new empty database and its user can be created as MariaDB root (XAMPP: no password):

```sql
CREATE DATABASE portal_hr CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'portal_hr'@'localhost' IDENTIFIED BY '...';
GRANT ALL PRIVILEGES ON portal_hr.* TO 'portal_hr'@'localhost';
```

Open http://localhost:3000. `/karir` is the public careers page and `/login` is the staff login.
The seed creates an admin with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env`.

### Environment variables

| Name | Purpose |
|---|---|
| `DATABASE_URL` | `mysql://portal_hr:PASSWORD@127.0.0.1:3306/portal_hr` |
| `SHADOW_DATABASE_URL` | Only for `npx prisma migrate dev`: an empty database it may wipe (`portal_hr_shadow`) |
| `DATABASE_POOL_MAX` | Optional, database connections kept open by the app (default 5) |
| `SESSION_SECRET` | Signs the login cookie. 32 random bytes, base64 |
| `ENCRYPTION_KEY` | Encrypts NIK, NPWP, BPJS, bank account numbers and salary. 32 random bytes, base64. **If it's lost, that data can't be recovered.** Keep a backup outside the server |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Project layout

```
prisma/
  schema.prisma          17 tables, see SCHEMA.md
  migrations/            MariaDB baseline incl. raw SQL rules (triggers: append-only audit log, one active bank
                         account, letter/CV owner, attested consent; CHECK: PKWT end date)
  migrations-postgresql/ old PostgreSQL history, reference only (not applied)
  seed.ts                development data
src/
  proxy.ts               quick redirect to /login when there is no session cookie
  lib/
    dal.ts               requireUser / requireRole: the real access check, used by every page and action
    session*.ts          signed session cookie (8 hours)
    crypto.ts            AES-256-GCM field encryption + masking (••••1234)
    audit.ts             writeAudit(): call it for every sensitive read or change
    labels.ts            Indonesian labels for enums, date and Rupiah formatting
  app/
    karir/               public careers page
    login/               staff login
    dashboard/           Ringkasan, Lowongan, Kandidat (pipeline board)
```

## Rules for new code

- Check access in the page or server action with `requireRole(...)`. `proxy.ts` alone is not protection.
- Never send `*Enc` fields to the browser. Decrypt only where needed and write an audit entry (e.g. `employee.nik_viewed`).
- Every new `page.tsx` under `/dashboard` needs `export const instant = false;` (Next.js 16 Cache Components; these pages depend on the session).
- A hiring manager sees only jobs where `hiringManagerId` is their own user.
- On the job form, department and hiring manager are free text (`resolveReferences` in `actions/jobs.ts`). A new department name is created (matched ignoring case). The manager name is always stored in `hiringManagerName`; `hiringManagerId` is set only when the text matches an active Admin/HR/Hiring Manager account by email, or by name when exactly one account has that name (two accounts with the same name: HR is asked to type the email). A name without an account gives nobody extra access. On edit, an unchanged manager keeps the link even if the account was renamed.

## Status

Done: database schema and migrations, login and logout, roles, audit log, dashboard summary, job list, candidate pipeline board, careers page, job create/edit (Admin/HR), job detail page with application form (CV upload checked by file content, max 5 MB; UU PDP consent with versioned privacy notice at `/karir/privasi`; optional talent pool).

CVs are saved to `./storage` in development (`src/lib/storage.ts`). Switch that file to an S3-compatible bucket before going live.
The privacy notice text is a draft. Have it reviewed and set the real HR contact email in `src/app/karir/privasi/page.tsx`.

Also done: candidate detail page (`/dashboard/kandidat/[id]`) with audited CV download, stage changes (rejection needs an internal reason), HR decision on each AI score, and AI CV screening.

### AI CV screening

`src/lib/screening.ts` sends the job's requirements and the CV to Claude (`claude-opus-5-5`, structured output) and stores a 0–100 score, summary, strengths, gaps and a short CV profile. PDFs are sent as documents (scans work too); DOCX is converted to text with mammoth.
It runs automatically in the background after each application (`after()` in `actions/apply.ts`), and HR can re-run it from the candidate page.

- Set `ANTHROPIC_API_KEY` in `.env` to switch it on. Without it, the app works and the AI section says it's off.
- The prompt tells the model to ignore religion, ethnicity, gender, age, marital status, photo and health, and to treat CV text as data (so a CV can't instruct the AI to give itself a high score).
- Server-side refusal fallback is on (`fallbacks: "default"`), so a declined request is retried on another model automatically.
- Bump `PROMPT_VERSION` when you change the prompt; every score records the model and prompt version.
- The AI never changes a candidate's stage. HR records a decision and moves the stage.

### Interviews, hiring and retention

- **Interviews** (candidate page): schedule date/time in WIB, duration, online/onsite, interviewer. Scheduling moves the candidate to *Wawancara* and notifies the interviewer in-app. Interviewers see the candidate even if the job isn't theirs, and can add a 1–5 rating, recommendation and notes from one hour before the start. Rated interviews can't be cancelled.
- **Hiring**: once a candidate is *Diterima*, Admin/HR create the Employee and first Contract from the candidate page. PKWT requires an end date and starts as *Aktif* (no probation for PKWT); PKWTT starts on *Masa percobaan*. Employees are listed at `/dashboard/karyawan`.
- **Contract alerts** (`src/lib/contracts.ts`, `CONTRACT_ALERT_DAYS = 42`): working employees (Aktif / Masa percobaan) whose end date is within 6 weeks, or already past, get an amber/red badge on the employee list and profile, a banner on the list (with a filter `?kontrak=berakhir`), a section on the dashboard, and a count badge on the **Karyawan** menu item. Days are counted in WIB calendar days (`daysUntil` in `src/lib/labels.ts`). The alert clears when HR extends the contract or changes the status (e.g. *Kontrak berakhir*). Actions that change it call `refresh()` or `revalidatePath("/dashboard", "layout")` so the menu badge updates.
- **Perpanjang / kontrak baru** (employee page, *Riwayat kontrak*; `renewContract` in `actions/employee-profile.ts`): adds the next contract (PKWT extension, new PKWT, or conversion to PKWTT), linked to the previous one via `renewalOf`, and moves the employee's type, position and end date to it. It must start after the previous contract; PKWT needs an end date and, counted from the first PKWT, may not exceed 5 years (PP 35/2021 Pasal 8). An employee marked *Kontrak berakhir* goes back to *Aktif*. Audited as `contract.renewed`.
- **Import karyawan** (`/dashboard/karyawan/import`): Excel template (`src/lib/employee-import.ts`) for existing employees and their current contract. Department is free text (created if new, `src/lib/departments.ts`); dates as DD/MM/YYYY in text-formatted cells (so Excel's regional settings can't swap day and month); employee numbers, emails and contract numbers are compared ignoring case (`src/lib/match.ts`); PKWT needs an end date and cannot be on probation; a blank contract number becomes `<No. induk>/IMPOR`. All rows must be valid or nothing is saved; employee numbers already present are skipped; clashing emails or contract numbers are listed as errors. NIK, NPWP, BPJS, salary and bank account are not imported: fill them on the profile (encrypted, audited). Shared Excel helpers for both imports are in `src/lib/excel.ts`.
- **Retention (UU PDP)**: `npm run retention` anonymises candidates past their `retainUntil` date: personal fields wiped, CV files deleted, AI text and interview notes cleared, offer-letter PDFs deleted (the letter number stays, recipient becomes "Kandidat dihapus"), and in-app notifications naming them removed; scores and stages stay for statistics. Notifications that name a person always start with "<full name> · ", and retention matches that prefix, so "Ani" does not also remove notifications about "Daniel". Candidates in Seleksi CV / Wawancara / Penawaran or hired are skipped (a hired candidate's record is wiped with the employee's, see Employee data). The same run also handles former employees. Use `npm run retention -- --dry-run` to preview. **Schedule it daily** (cron on Linux, Task Scheduler on Windows, or your host's scheduler).

### Candidate bank (Bank Kandidat)

- `/dashboard/kandidat/bank` (Admin/HR): every candidate whose data is still kept, searchable by name, email, city, AI-extracted skills and job titles; filters for education and talent pool.
- **Tambah kandidat**: for CVs received by email, WhatsApp, job fair, referral, etc. HR must tick that the candidate agreed and write the evidence (stored as `consentMethod = HR_ATTESTED` with `consentEvidence` and who recorded it; a database CHECK enforces both). Share `/karir/privasi` with the candidate when asking for consent.
- Without a job, the CV is stored on the candidate. **Masukkan ke lowongan** creates an application with the latest CV and runs AI screening for that job.
- Retention applies the same way and also removes candidate-level CVs and the consent evidence text.
- **Import dari Excel** (`/dashboard/kandidat/bank/import`): HR downloads the template (`import/template`, built by `src/lib/candidate-import.ts` with dropdowns and a "Petunjuk" sheet), fills one row per candidate (max 500) and uploads it. Every row needs consent evidence, and HR ticks a statement for the whole file. If any row is invalid nothing is saved and the page lists the rows to fix; emails already in the bank are skipped. Imported candidates have no CV: upload it from the profile page (**Unggah CV**) before *Masukkan ke lowongan*. Each imported candidate gets a `candidate.imported_by_hr` audit entry.

### Starting the app and testing from a MacBook or phone

1. On this PC, double-click **`Start Portal HR.bat`** (in `D:\Claude HR`). It starts XAMPP's MariaDB if it isn't running, applies any new migrations, starts the app, and prints the address for other devices, e.g. `http://192.168.100.115:3000`. Keep the window open; closing it stops the app (MariaDB keeps running).
2. On the MacBook (same Wi-Fi/office network), open that address in Safari or Chrome.

- `next.config.ts` allows this PC's current network addresses automatically (read at start-up), so a new Wi-Fi address only needs a restart of the .bat.
- If the MacBook can't connect: check both are on the same network (guest Wi-Fi often blocks devices from seeing each other), and that Windows Firewall allows port 3000 on Private networks.
- This is plain `http` in development mode: internal testing with sample data only.

### Database (MariaDB in XAMPP)

Start the app from this folder with `npm run dev` (inside `hr-app`). Note: the Claude preview pane's own launcher resolves paths from the session's original folder, so run the dev server directly here.

- **Where**: XAMPP's MariaDB 10.11 on port 3306, database `portal_hr` (collation `utf8mb4_unicode_ci`), user `portal_hr` whose password is only in `.env`. `portal_hr_shadow` is an empty helper for `prisma migrate dev`.
- **Root and phpMyAdmin**: MariaDB's `root` has a password (kept on this PC in `D:\Claude HR\_rahasia\mariadb-root.txt`, git-ignored; move it to a password manager). phpMyAdmin asks for a login (`auth_type = cookie` in `C:\xampp\phpMyAdmin\config.inc.php`; its helper user `pma` has its own password there). Backups of the original XAMPP files: `config.inc.php.portal-hr.bak`, `my.ini.portal-hr.bak`.
- **Server settings** changed in `C:\xampp\mysql\bin\my.ini` `[mysqld]`: `max_allowed_packet=16M` (XAMPP default 1M). Long text that can exceed 64 KB (CV text, letter template body) is `MEDIUMTEXT`.
- **Start automatically (recommended)**: open XAMPP Control Panel **as administrator** and tick the **Svc** box next to MySQL. MariaDB then runs as the Windows service `mysql` and starts with the PC. Without it, `Start Portal HR.bat` starts MariaDB in a separate minimised window, which must stay open. The .bat checks the server with `mysqladmin ping` (netstat sometimes missed it).
- **Table names are lowercase** (`@@map`, e.g. `audit_log`, `bank_account`), so a dump made on Windows imports unchanged on a Linux MySQL/MariaDB host, where table names are case-sensitive.
- **Case-insensitive comparisons**: the `_ci` collation makes `"uji-001" = "UJI-001"` in queries and in unique indexes (`src/lib/match.ts` only names that intent).
- **Rules Prisma can't express** live in the baseline migration: triggers for the append-only audit log, one active bank account per employee, a letter's recipient, a CV's owner and HR-attested consent, plus a CHECK for the PKWT end date. (MariaDB rejects CHECKs on columns whose foreign key cascades, hence triggers.)
- **Changing the schema**: edit `prisma/schema.prisma`, run `npx prisma migrate dev --name what_changed`, commit the new folder under `prisma/migrations`. `Start Portal HR.bat` applies pending migrations (`prisma migrate deploy`) and regenerates the client (`prisma generate`) on start; when the dev server is already running, restart it after a schema change. Folders run in name order and Prisma names them by UTC time, so check a new folder sorts after the latest one (the baseline is named `20261102170000`, in WIB); rename it if not, before it is applied anywhere.
- **Moving to hosting**: create a MySQL 8 / MariaDB 10.6+ database with `utf8mb4_unicode_ci`, set `DATABASE_URL`, run `npx prisma migrate deploy` (or import a dump of `portal_hr`). The database user needs the TRIGGER privilege; with binary logging on, MySQL also needs `log_bin_trust_function_creators=1` to create the triggers.
- **History**: the data was moved from the earlier PostgreSQL (`prisma dev`) on 2 Nov 2026, all 18 tables with matching row counts; the old PostgreSQL instance and its data were then removed. The old migrations are in `prisma/migrations-postgresql` for reference.

To look at the data, double-click **`Buka Database.bat`** (in `D:\Claude HR`). With XAMPP's Apache running it opens phpMyAdmin on the `portal_hr` database; otherwise Prisma Studio at http://localhost:5555. Portal HR keeps running meanwhile. Encrypted fields show as `v1.…`; changes made there skip the app's validation and audit log, and `audit_log` rows cannot be changed or deleted.

### Employee data

`/dashboard/karyawan/[id]` (Admin/HR): employment details (department, position, status, manager), personal data (birth place/date, gender, address, PTKP status) and identity numbers.

- **NIK, NPWP, BPJS Kesehatan, BPJS Ketenagakerjaan** are stored AES-256-GCM encrypted (`*Enc`) with the last 4 digits in plain text (`*Last4`) for masked display. Pages select only `*Last4`; full numbers reach the browser only through **Lihat**, which writes an `employee.sensitive_viewed` audit entry and hides the number again after 30 seconds.
- Format checks (`src/lib/indonesia-id.ts`): NIK 16 digits with the birth date and gender encoded in it (women: day + 40), cross-checked against the form; NPWP 15 or 16 digits; BPJS Kesehatan 13; KPJ 11. These catch typos only, not whether a number is registered.
- On a validation error the identity numbers are not sent back to the browser; HR re-types them.
- Audit entries list which fields changed, never their values.
- Leaving an identity field blank keeps the stored number.
- **Ubah identitas** (`updateIdentity`): name, email, phone, employee number and join date, for typos from hiring or import. Employee number and email must stay unique (ignoring case); the employee's login email follows. The join date may not be after the first contract's start, the contract end, or the exit date. The audit log records employee number and join date changes with values, and name/email/phone only as "changed" (the log can never be edited, so it must not hold data retention will wipe).
- **Tanggal keluar** (`exitDate`): set when the status becomes *Mengundurkan diri / Diberhentikan / Kontrak berakhir* (typed, else the contract end date, else today); cleared when the employee is active again (e.g. a contract renewal).
- **Hapus karyawan (salah input)** (`deleteEmployee`): permanent, only when nothing is attached (no letters, documents, bank data, login, or reports). HR types the employee number to confirm; contracts go with it; `employee.deleted` is audited with the number only. Anyone who actually worked here keeps their record: change the status instead.
- **Retention for former employees** (`anonymizeFormerEmployees` in `src/lib/retention.ts`, run by `npm run retention`): `EMPLOYEE_RETENTION_YEARS` (default **10**, the tax-record period of UU KUP Pasal 28) after the exit date, it wipes name, contact, birth data, address, PTKP, NIK/NPWP/BPJS, bank details, salary, letter PDFs and texts, uploaded documents, the login, notifications naming them, and their recruitment record (candidate + CV). Kept: employee number, department, position, dates and contracts. The profile then shows a read-only summary.

### Letters

`/dashboard/surat` (Admin/HR). SP1–SP3, Surat Keterangan Kerja, Paklaring and the SK Mutasi / Promosi / Demosi decrees are issued from the employee page; offer letters from the candidate page at the *Penawaran* stage. Each form shows a live preview.

- **SK Mutasi / Promosi / Demosi**: HR enters the new position, new department (free text), effective date and the grounds (`{{alasan}}`); mutasi also needs the new work location, promosi/demosi need a different position, and demosi grounds must be at least 20 characters. An optional new salary is printed only in the PDF (blank prints "Sesuai ketentuan perusahaan yang berlaku"). A ticked-by-default box updates the employee's position and department when the letter is issued (audited as `employee.employment_updated` with the letter number). Codes: `SK-MUT`, `SK-PRO`, `SK-DEM`. These letters, like SP, carry a "Diterima oleh" signature space.

- **Templates** (`/dashboard/surat/template`): default wording in `src/lib/letters/defaults.ts` is a **draft** for HR/legal to review. Edits save as a new version; issued letters keep the version they were made from. `{{placeholders}}` are listed in the editor. Lines like `Label : value` render as an aligned table.
- **Numbering**: running number per letter type per year (WIB), e.g. `001/HR/SP1/XI/2026`. Change the layout with `LETTER_NUMBER_FORMAT` (`{seq}`, `{kode}`, `{bulan}` in Roman numerals, `{tahun}`).
- **Letterhead and signatory**: `COMPANY_NAME`, `COMPANY_ADDRESS`, `COMPANY_CITY`, `LETTER_SIGNATORY_NAME`, `LETTER_SIGNATORY_TITLE` in `.env`.
- **PDF**: rendered with pdf-lib (A4, Helvetica) and stored privately under `storage/letters`; downloads are Admin/HR only and audited. SP letters include a "Diterima oleh" signature space for the employee. SP validity is 6 months.
- Offer-letter and promosi/demosi salaries exist only inside the stored PDF, not in a database column.

### Employee logins and payroll bank account changes

- **Logins**: HR creates (or resets) an employee's login on the employee page. A 10-character temporary password is shown once; the employee must change it at first login (`mustChangePassword`; `requireUser()` sends them to `/dashboard/akun` until they do).
- **Change request** (`/dashboard/rekening`): the employee picks a bank, enters the account number (length checked per bank in `src/lib/banks.ts`) and confirms with a 6-digit OTP (10 minutes, 5 attempts, stored as a SHA-256 hash only).
- **Name check**: `inquireAccountName()` in `src/lib/banking.ts` is a **stub**. It returns the employee's name, or "NAMA PEMILIK LAIN" for numbers ending in `0000`, so both paths can be tested. Replace it with a real account-inquiry provider (e.g. Xendit or Flip) before go-live.
- **OTP delivery**: there is no email/WhatsApp sender, by decision (30 Oct 2026: internal HR tool, no email sender wanted). In development (`npm run dev`) the code is shown on screen and logged. In production mode (`npm run build` + `npm start`) `deliverOtp()` refuses, so bank change requests only work while the app runs in development mode. Revisit before running it in production mode.
- **Approval (maker-checker)**: HR approves with the payroll month it applies from. The requester can never approve their own request, and a name mismatch needs an explicit "verified in person" tick. Approval deactivates the old account and activates the new one; the database allows one active account per employee.
- **Entered by HR** (employee page → Rekening gaji → *Daftarkan/Ganti rekening (diinput HR)*; `submitBankChangeByHr`): for employees without a login, or who hand HR a signed form. No OTP, so HR must write the basis (kept in the audit log, so 8+ digits in a row are refused: no account, NIK or phone numbers there) and the request records the maker (`requestedById`). It is refused while the employee is mid-way through their own OTP request. Another HR/Admin must approve it: the maker sees only *Batalkan pengajuan saya*, and the server refuses a maker's own approval. **Needs at least two HR/Admin accounts.** The employee, if they have a login, gets a tamper-alert notification. Old accounts are never deleted, only deactivated, so the payroll history stays.
- Account numbers are stored encrypted (`••••last4` in the UI; full number via audited *Lihat* on the employee page). HR and the employee get in-app notifications, shown on the dashboard.

### Interview guides (structured interviews)

- **Per job** (`/dashboard/lowongan/[id]/wawancara`; Admin/HR or the job's hiring manager): competencies, questions (behavioural / situational / technical), what to look for, a 1/3/5 scoring guide and follow-up probes. Draft with AI (`src/lib/interview-kit.ts`) or write by hand; manual saves are validated with the same Zod schema the AI output uses (`src/lib/interview-kit-schema.ts`).
- **Approval**: any edit puts the guide back to *Draf*. Only Admin/HR can approve, and only approved guides show to interviewers on the candidate page.
- **Per candidate**: AI drafts 3–5 extra questions from the CV screening result (summary, gaps, extracted profile; the raw CV is not sent again), each with the reason it's asked.
- Prompts forbid questions on religion, ethnicity, origin, gender, age, marital status or family plans, pregnancy, health/disability, politics and appearance (UU 13/2003 Pasal 5–6, UU PDP). HR review remains the safeguard.
- `src/lib/ai.ts` holds the shared Claude client, model id and error messages for all AI features.

Next: calendar invites (.ics) for interviews, KTP/KK/NPWP document uploads, per-question scores in interview feedback (SP1–SP3, Surat Keterangan Kerja), bank account change requests with approval, 2FA for HR.
Later phases: employees and contracts, letter generator (SP, Surat Keterangan), bank change requests with approval, 2FA for HR.
