# Portal HR

Internal HR web app: hiring, CV screening, HR documents and employee bank data.
UI in Bahasa Indonesia. Database design: [SCHEMA.md](SCHEMA.md).

**Stack:** Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · PostgreSQL · Prisma 7 · jose (session cookie) · bcrypt · zod

## Run locally

Requires Node.js 22+.

```bash
npm install
cp .env.example .env        # then fill in the values (see below)
npx prisma dev --name hr-app --detach   # local Postgres, no install needed
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000. `/karir` is the public careers page and `/login` is the staff login.
The seed creates an admin with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env`.

### Environment variables

| Name | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SHADOW_DATABASE_URL` | Only for `prisma dev` (port after the main DB port) |
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
  migrations/            includes raw SQL rules (append-only audit log, one active bank account, PKWT end date)
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
- **Hiring**: once a candidate is *Diterima*, Admin/HR create the Employee and first Contract from the candidate page. PKWT requires an end date and starts as *Aktif* (no probation for PKWT); PKWTT starts on *Masa percobaan*. Employees are listed at `/dashboard/karyawan`, with contracts ending within 30 days highlighted there and on the dashboard.
- **Retention (UU PDP)**: `npm run retention` anonymises candidates past their `retainUntil` date: personal fields wiped, CV files deleted, AI text and interview notes cleared; scores and stages stay for statistics. Candidates in Seleksi CV / Wawancara / Penawaran or hired are skipped. Use `npm run retention -- --dry-run` to preview. **Schedule it daily** (cron on Linux, Task Scheduler on Windows, or your host's scheduler).

### Candidate bank (Bank Kandidat)

- `/dashboard/kandidat/bank` (Admin/HR): every candidate whose data is still kept, searchable by name, email, city, AI-extracted skills and job titles; filters for education and talent pool.
- **Tambah kandidat**: for CVs received by email, WhatsApp, job fair, referral, etc. HR must tick that the candidate agreed and write the evidence (stored as `consentMethod = HR_ATTESTED` with `consentEvidence` and who recorded it; a database CHECK enforces both). Share `/karir/privasi` with the candidate when asking for consent.
- Without a job, the CV is stored on the candidate. **Masukkan ke lowongan** creates an application with the latest CV and runs AI screening for that job.
- Retention applies the same way and also removes candidate-level CVs and the consent evidence text.

### Local database notes (`prisma dev`)

Start the app from this folder with `npm run dev` (inside `hr-app`). Note: the Claude preview pane's own launcher resolves paths from the session's original folder, so run the dev server directly here.

`prisma dev` is a lightweight local Postgres. It handles one connection at a time, so `.env` sets `DATABASE_POOL_MAX=1`; remove that for a real PostgreSQL server. Avoid running scripts against it while `npm run dev` is running. If the app shows "Connection terminated unexpectedly", stop the app and run:

```bash
npx prisma dev stop hr-app
npx prisma dev --name hr-app --detach --port 51213 --db-port 51214 --shadow-db-port 51215
```

### Employee data

`/dashboard/karyawan/[id]` (Admin/HR): employment details (department, position, status, manager), personal data (birth place/date, gender, address, PTKP status) and identity numbers.

- **NIK, NPWP, BPJS Kesehatan, BPJS Ketenagakerjaan** are stored AES-256-GCM encrypted (`*Enc`) with the last 4 digits in plain text (`*Last4`) for masked display. Pages select only `*Last4`; full numbers reach the browser only through **Lihat**, which writes an `employee.sensitive_viewed` audit entry and hides the number again after 30 seconds.
- Format checks (`src/lib/indonesia-id.ts`): NIK 16 digits with the birth date and gender encoded in it (women: day + 40), cross-checked against the form; NPWP 15 or 16 digits; BPJS Kesehatan 13; KPJ 11. These catch typos only, not whether a number is registered.
- On a validation error the identity numbers are not sent back to the browser; HR re-types them.
- Audit entries list which fields changed, never their values.
- Leaving an identity field blank keeps the stored number.

### Letters

`/dashboard/surat` (Admin/HR). SP1–SP3, Surat Keterangan Kerja and Paklaring are issued from the employee page; offer letters from the candidate page at the *Penawaran* stage. Each form shows a live preview.

- **Templates** (`/dashboard/surat/template`): default wording in `src/lib/letters/defaults.ts` is a **draft** for HR/legal to review. Edits save as a new version; issued letters keep the version they were made from. `{{placeholders}}` are listed in the editor. Lines like `Label : value` render as an aligned table.
- **Numbering**: running number per letter type per year (WIB), e.g. `001/HR/SP1/XI/2026`. Change the layout with `LETTER_NUMBER_FORMAT` (`{seq}`, `{kode}`, `{bulan}` in Roman numerals, `{tahun}`).
- **Letterhead and signatory**: `COMPANY_NAME`, `COMPANY_ADDRESS`, `COMPANY_CITY`, `LETTER_SIGNATORY_NAME`, `LETTER_SIGNATORY_TITLE` in `.env`.
- **PDF**: rendered with pdf-lib (A4, Helvetica) and stored privately under `storage/letters`; downloads are Admin/HR only and audited. SP letters include a "Diterima oleh" signature space for the employee. SP validity is 6 months.
- Offer-letter salary exists only inside the stored PDF, not in a database column.

### Employee logins and payroll bank account changes

- **Logins**: HR creates (or resets) an employee's login on the employee page. A 10-character temporary password is shown once; the employee must change it at first login (`mustChangePassword`; `requireUser()` sends them to `/dashboard/akun` until they do).
- **Change request** (`/dashboard/rekening`): the employee picks a bank, enters the account number (length checked per bank in `src/lib/banks.ts`) and confirms with a 6-digit OTP (10 minutes, 5 attempts, stored as a SHA-256 hash only).
- **Name check**: `inquireAccountName()` in `src/lib/banking.ts` is a **stub**. It returns the employee's name, or "NAMA PEMILIK LAIN" for numbers ending in `0000`, so both paths can be tested. Replace it with a real account-inquiry provider (e.g. Xendit or Flip) before go-live.
- **OTP delivery**: there is no email/WhatsApp sender, by decision (30 Oct 2026: internal HR tool, no email sender wanted). In development (`npm run dev`) the code is shown on screen and logged. In production mode (`npm run build` + `npm start`) `deliverOtp()` refuses, so bank change requests only work while the app runs in development mode. Revisit before running it in production mode.
- **Approval (maker-checker)**: HR approves with the payroll month it applies from. The requester can never approve their own request, and a name mismatch needs an explicit "verified in person" tick. Approval deactivates the old account and activates the new one; the database allows one active account per employee.
- Account numbers are stored encrypted (`••••last4` in the UI; full number via audited *Lihat* on the employee page). HR and the employee get in-app notifications, shown on the dashboard.

### Interview guides (structured interviews)

- **Per job** (`/dashboard/lowongan/[id]/wawancara`; Admin/HR or the job's hiring manager): competencies, questions (behavioural / situational / technical), what to look for, a 1/3/5 scoring guide and follow-up probes. Draft with AI (`src/lib/interview-kit.ts`) or write by hand; manual saves are validated with the same Zod schema the AI output uses (`src/lib/interview-kit-schema.ts`).
- **Approval**: any edit puts the guide back to *Draf*. Only Admin/HR can approve, and only approved guides show to interviewers on the candidate page.
- **Per candidate**: AI drafts 3–5 extra questions from the CV screening result (summary, gaps, extracted profile; the raw CV is not sent again), each with the reason it's asked.
- Prompts forbid questions on religion, ethnicity, origin, gender, age, marital status or family plans, pregnancy, health/disability, politics and appearance (UU 13/2003 Pasal 5–6, UU PDP). HR review remains the safeguard.
- `src/lib/ai.ts` holds the shared Claude client, model id and error messages for all AI features.

Next: calendar invites (.ics) for interviews, KTP/KK/NPWP document uploads, per-question scores in interview feedback (SP1–SP3, Surat Keterangan Kerja), bank account change requests with approval, 2FA for HR.
Later phases: employees and contracts, letter generator (SP, Surat Keterangan), bank change requests with approval, 2FA for HR.
