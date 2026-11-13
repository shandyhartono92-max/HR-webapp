# Lokasi Batam dan Jakarta: database terpisah — Design

Date: 2026-11-13 · Status: approved in chat, awaiting written review

## Goal

Portal HR serves two locations, **Batam** and **Jakarta**, from one app. Each location keeps its
data in its own database with the same structure and the same functions. At login the user picks
the location; one account can have access to one or both locations, with a role per location.

## Decisions made with the user

| Topic | Decision |
|---|---|
| Separation | Separate databases per location (not one database with a location column) |
| Accounts | One account, access granted per location (approach A: an accounts database + two location databases) |
| Careers page | One combined page; each application goes to the database of its job's location |
| Existing data | The current database `portal_hr` becomes **Batam**; Jakarta starts empty |
| Letters | Each location is a different PT: own name, address, city and signatory |
| Who manages access | First version: any ADMIN (in any location) manages accounts and access for all locations |

## 1. Databases

- **`portal_hr_akun`** (new), schema `prisma/accounts/schema.prisma`, migrations `prisma/accounts/migrations`:
  - `Account`: id (cuid, the same id used in the location databases), email (unique), name,
    passwordHash, mustChangePassword, isActive, lastLoginAt, createdAt.
  - `SiteAccess`: accountId + site (unique together), role (`ADMIN | HR | HIRING_MANAGER | EMPLOYEE`).
    No row = no access to that location.
  - `LoginEvent`: accountId (nullable), site, kind (`login | logout | switch | failed`), createdAt.
    Failed attempts store no password and no email for unknown accounts.
- **`portal_hr`** (Batam) and **`portal_hr_jakarta`** (new) both use `prisma/schema.prisma` and
  `prisma/migrations`. Their `User` table becomes the account mirror: id (= Account.id), email, name,
  role (the role in this location), isActive. Password columns are removed from it. Every existing
  relation to `User` (employee login, interviewer, audit actor, letter issuer, bank request
  reviewer, …) stays as it is.
- Migrations for the location schema are deployed to every location by one script
  (`scripts/migrate-sites.mts`), so the two location databases never drift apart.
- `prisma/migrations-postgresql` (stale since 2 Nov) is left untouched.

## 2. Site configuration

- Locations are defined in `.env`, one block per code (`batam`, `jakarta`):
  `SITES="batam,jakarta"`, `SITE_LABEL_<CODE>`, `DATABASE_URL_<CODE>`,
  `COMPANY_NAME_<CODE>`, `COMPANY_ADDRESS_<CODE>`, `COMPANY_CITY_<CODE>`, and the signatory fields
  the letters use today, suffixed with `_<CODE>`. Plus `ACCOUNTS_DATABASE_URL` and the shadow URL
  for the accounts schema.
- `src/lib/sites.ts` (pure, checked by a script) reads and validates this configuration: list of
  sites, label, company identity; a missing value names the variable.
- A third location later = one more config block + one more database + `migrate-sites`.

## 3. Login, session and switching location

- Login page: location (Batam/Jakarta), email, password. The password is checked against
  `portal_hr_akun`; then `SiteAccess` for the chosen location.
  - Wrong email or password: the same message as today.
  - Right password, no access: "Akun ini tidak punya akses ke Jakarta." (only after the password
    is proven, so it reveals nothing to someone who does not know the password). If the account has
    access to exactly one other location, the message names it.
- Session JWT (`hr_session`): `{ userId, role, site }`. `site` is signed, so it cannot be changed
  in the browser.
- On entering a location, the mirror `User` row in that location's database is created or updated
  (name, email, role from `SiteAccess`, isActive).
- `src/lib/dal.ts` keeps reading the role from the location database on every request (as today),
  and also rejects a session whose `site` is not configured or whose account lost access.
- Header shows the active location. Users with access to both see "Pindah ke Jakarta/Batam":
  a server action that checks access, signs a new session for the other location, updates the
  mirror and opens that location's dashboard. No password retype.
- Change password lives in the accounts database, so it applies to both locations at once.
- Logout, login, switch and failed logins are written to `LoginEvent`.

## 4. Code that uses the location database

- `src/lib/db.ts`: no global `db`. `siteDb()` reads `site` from the session and returns that
  location's Prisma client (one cached client per location). `dbFor(site)` for code without a
  session (background jobs, careers page, scripts). `accountsDb` for the accounts database.
  The 47 files that import `db` change to `const db = await siteDb()`; logic unchanged.
- Background jobs (`src/lib/background-jobs.ts`, training graduation): run for every location in
  turn; a failure in one location is logged and does not stop the other.
- Files: new files are saved under `storage/<site>/…`. Existing Batam keys stay where they are and
  keep working, since the key is stored in the Batam database.
- Letters: company identity from the active location's configuration. Letter numbers are counted
  per database, so each location numbers its own letters.
- `ENCRYPTION_KEY` is shared by both locations.
- Audit log stays in each location's database; login events in the accounts database.

## 5. Combined careers page

- `/karir` lists open jobs from every location, labelled with the location, with a location filter.
  A location whose database is down is left out with a short note; the other still shows.
- Job URL: `/karir/<site>/<slug>` (slugs are unique per database only). The application is saved in
  that site's database. Old links `/karir/<slug>` redirect to `/karir/batam/<slug>` (all existing
  jobs belong to Batam); unknown slugs show the normal not-found page.
- `/karir/privasi` stays one page.

## 6. Managing accounts and access

- **Pengguna** (ADMIN only) manages accounts in `portal_hr_akun`. Each row shows the access per
  location, e.g. "Batam: HR · Jakarta: —". An ADMIN can add, change or remove access per location,
  deactivate an account, and reset a password, for every location.
- Removing access to a location sets the mirror `User` in that location to inactive; its letters,
  audit rows and other history stay.
- Creating an employee login from an employee profile (`src/app/actions/accounts.ts`) creates the
  Account if needed and grants `EMPLOYEE` access to the current location only. An email that already
  has an Account gets the access added instead of an error.
- An ADMIN cannot remove their own last ADMIN access (so the portal never ends up without one).

## 7. Moving the existing data

Run once on this computer, each step checked before the next:

1. Back up `portal_hr` with mysqldump to a private folder outside the repo (it holds personal data).
2. Create `portal_hr_akun`, `portal_hr_jakarta` and the accounts shadow database. This needs the
   MariaDB root user (the app user cannot create databases); the commands are prepared, passwords
   are never printed. Grant the app user rights on the new databases.
3. `scripts/split-accounts.mts`: copy every `portal_hr.User` into `Account` (id, email, name,
   passwordHash, mustChangePassword, isActive, lastLoginAt, createdAt) and give each one
   `SiteAccess` batam with its current role. Re-runnable without duplicates; compares counts.
4. The location migration that drops the password columns from `User`. `migrate-sites` refuses to
   apply it while any `User` in that database has no matching `Account` (so no password is lost).
5. Deploy all location migrations to `portal_hr_jakarta`. Nothing is seeded: letter templates are
   created on first use, departments by import or job creation, and the mirror `User` on first
   entry. No employees or candidates are copied. `prisma/seed.ts` (demo data) changes to create
   its admin as an `Account` with access to every location.
6. `.env`: `ACCOUNTS_DATABASE_URL`, `DATABASE_URL_BATAM` (today's URL), `DATABASE_URL_JAKARTA`,
   company identity per location (today's `COMPANY_*` become Batam's). `.env.example` updated
   without secret values.

Backups from then on: `scripts/backup.mts` dumps all three databases together into one dated folder.

## Out of scope

- OTP by email (parked), login rate limiting and 2FA (deferred).
- Limiting an ADMIN to their own location (possible later; data model already supports it).
- Moving existing files into `storage/batam/`.
- Reporting across both locations.
- The foreign workers (TKA) feature: designed separately after this.

## Testing

- Check scripts: site configuration (missing values named), access rules (enter / refused / switch),
  account split on a test database (counts, re-run safe, guard before dropping columns), session
  (unknown or tampered `site` rejected).
- Browser: login to Batam and to Jakarta; refused without access; switch from the header; data of
  one location never shows in the other; combined careers page and the application landing in the
  right database; letters with each PT's letterhead; training job runs for both.
- All existing check scripts, `tsc` and lint stay green.
- Guides: HR and employee guides updated (choosing a location at login, switching); HR guide gets
  a section on managing access.
