# Redesign Korporat Biru Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Portal HR web app (`hr-app/`) to the approved "Korporat Biru" look on desktop and phone, with no change to data, server actions, access rules or flows.

**Architecture:** Colours move to a `brand` scale and a `card` utility in `globals.css` (Tailwind v4 `@theme` / `@utility`). The dashboard shell gets a dark grouped sidebar built from a pure nav model (`src/lib/nav.ts`); the server still decides which items a role sees, and two small client components handle active-link highlighting and the phone drawer. Pages change only class names and markup.

**Tech Stack:** Next.js 16 App Router (Cache Components, `instant = false` on dashboard pages), React 19, Tailwind CSS v4, TypeScript. No test framework in the repo: checks are `npx tsc --noEmit`, `npx eslint`, small `tsx` check scripts, and CDP screenshots.

**Spec:** `docs/superpowers/specs/2026-11-10-redesign-korporat-biru-design.md`

## Global Constraints

- Visuals only: no edits to `src/app/actions/**`, `src/lib/dal.ts`, `proxy.ts`, Prisma schema, or any query/`where` clause.
- No new npm dependencies; icons are inline SVG.
- Colours (from the spec): page bg `#f1f5f9`; sidebar `#0f2744`, text `#cbd5e1`, group label `#7c93b0`; active item bg `#1d4ed8` text white; brand `#1d4ed8` (blue-700), soft `#dbeafe`; warning bg `#fef3c7` text `#92400e` line `#fcd34d`; success bg `#dcfce7` text `#166534`; table head `#f8fafc`; card white, border `#e2e8f0`, radius 10px, light shadow.
- Nav groups, verbatim: **Utama** (Ringkasan) · **Rekrutmen** (Lowongan, Kandidat, Bank Kandidat) · **Karyawan** (Karyawan, Surat, Rekening Gaji) · **Pengaturan** (Pengguna, Log Audit, Akun Saya). A group with no visible item for the role is not rendered.
- Out of scope: global search, header bell, Karyawan quick filters, trend text on stat cards, dark mode.
- All task commits go on branch `redesign-korporat-biru`; `main` is untouched until the user approves the after-screenshots (spec: commit after the user has seen the result).
- Every dashboard `page.tsx` keeps `export const instant = false`.
- UI copy stays Bahasa Indonesia.
- Screenshot tool and its output live in the session scratchpad, never in the repo. Log in with the local seed Admin account; never print its password.

## Review Focus

1. **Active link on nested routes:** on `/dashboard/kandidat/bank/import` only "Bank Kandidat" is active (not "Kandidat"); on `/dashboard/karyawan/abc` "Karyawan" is active; on `/dashboard` only "Ringkasan". Pinned by `activeHref` checks in Task 2.
2. **Role visibility unchanged:** EMPLOYEE sees exactly Ringkasan, Rekening Gaji, Akun Saya (groups Utama, Karyawan, Pengaturan); HIRING_MANAGER never sees Bank Kandidat or Pengguna. Pinned by `navGroupsFor` checks in Task 2.
3. **Phone drawer state:** after tapping a link the drawer is closed on the new page; Escape and backdrop close it; body does not scroll behind it. Checked in Task 3 Step 6.
4. **No horizontal page scroll at 390px:** wide tables scroll inside their card, the page itself never does. Checked by `scrollWidth` in Task 7.
5. **Missed teal class:** a `teal-*` left behind or a string like `"teal"` in copy changed by mistake. Pinned by the grep in Task 1.

---

### Task 0: Screenshot tool and "before" screenshots

**Files:**
- Create (scratchpad, not repo): `<scratchpad>/shots/shoot.mjs`

**Interfaces:**
- Produces: `node shoot.mjs <outDir>` → writes `<outDir>/<page>-<desktop|phone>.png` for every page in its list and prints `scrollWidth` per phone shot.

- [ ] **Step 1: Write `shoot.mjs`**

Launch `msedge.exe --headless=new --remote-debugging-port=9333 --user-data-dir=<tmp>`, read `http://127.0.0.1:9333/json/version`, talk CDP over Node's global `WebSocket`. Log in once at `http://localhost:3000/login` by `Runtime.evaluate` (set the email/password inputs with the native value setter + `input` event, click submit, wait for URL `/dashboard`); credentials come from env vars `SHOT_EMAIL` / `SHOT_PASSWORD`. Then for each page: `Emulation.setDeviceMetricsOverride` (1440×900 dpr 1, then 390×844 dpr 2 `mobile:true`), `Page.navigate`, wait for `Page.loadEventFired` + 800 ms, `Page.captureScreenshot` with `captureBeyondViewport:true`. Pages: `/dashboard`, `/dashboard/lowongan`, `/dashboard/kandidat`, `/dashboard/kandidat/bank`, `/dashboard/karyawan`, first `/dashboard/karyawan/<id>` link found on the list page, `/dashboard/surat`, `/dashboard/rekening`, `/dashboard/pengguna`, `/karir`; `/login` shot in a fresh logged-out context first.

- [ ] **Step 2: Create the branch** `git switch -c redesign-korporat-biru`

- [ ] **Step 3: Run against the current app**

Run (dev server up via `Start Portal HR.bat` or `npm run dev`): `node shoot.mjs before`
Expected: 22 PNGs in `before/`, no exceptions. Open two to confirm they show real pages, not the login screen.

---

### Task 1: Brand colour scale and teal → brand

**Files:**
- Modify: `src/app/globals.css`
- Modify: every file under `src/` containing `teal-<n>` (35 files, 164 uses)

**Interfaces:**
- Produces: Tailwind colours `brand-50 … brand-900` (values = Tailwind `blue-50 … blue-900`), CSS var `--background: #f1f5f9`.

- [ ] **Step 1: Add the scale** in the `@theme inline` block: `--color-brand-50: #eff6ff; … --color-brand-900: #1e3a8a;` (blue scale), and set `:root { --background: #f1f5f9 }`.
- [ ] **Step 2: Replace** with a Node one-off: regex `/\bteal-(\d{2,3})\b/g` → `brand-$1` over `src/**/*.{ts,tsx,css}`.
- [ ] **Step 3: Verify**
  Run: `grep -rnE 'teal' src` → Expected: no output.
  Run: `npx tsc --noEmit; npx eslint` → Expected: both clean.
  Run: `git diff --stat` → Expected: only class-name lines changed (spot-check 3 files).
- [ ] **Step 4: Commit** `git commit -m "Switch the accent colour from teal to the Korporat Biru brand blue"`

---

### Task 2: Nav model and icons

**Files:**
- Create: `src/lib/nav.ts`
- Create: `src/app/ui/icons.tsx`
- Create (scratchpad): `<scratchpad>/check-nav.mts`

**Interfaces:**
- Produces:
  - `type NavIconName = "home" | "brief" | "users" | "db" | "badge" | "doc" | "bank" | "key" | "user" | "audit"`
  - `type NavItem = { href?: string; label: string; icon: NavIconName; roles: Role[] }`
  - `type NavGroup = { title: string; items: NavItem[] }`
  - `navGroupsFor(role: Role): NavGroup[]` — groups/items in the Global Constraints order, filtered by role, empty groups dropped. Roles per item exactly as today's `nav` array in `dashboard/layout.tsx`.
  - `activeHref(pathname: string, hrefs: string[]): string | null` — `/dashboard` only on exact match; otherwise the longest href that equals `pathname` or is a prefix followed by `/`.
  - `initials(name: string): string` — first letters of the first two words, upper-case; `"Administrator"` → `"AD"` (single word: first two letters).
  - `icons.tsx`: `export function NavIcon({ name, className }: { name: NavIconName; className?: string })` — 24×24 stroke icons copied from the mockup's `icon` map (`audit` = a clipboard), `aria-hidden`.

- [ ] **Step 1: Write `check-nav.mts`** with `node:assert`:
  ```ts
  const labels = (r: Role) => navGroupsFor(r).map(g => [g.title, g.items.map(i => i.label)]);
  assert.deepEqual(labels("EMPLOYEE"), [["Utama",["Ringkasan"]],["Karyawan",["Rekening Gaji"]],["Pengaturan",["Akun Saya"]]]);
  assert.ok(!labels("HIRING_MANAGER").flat(2).includes("Bank Kandidat"));
  assert.ok(!labels("HR").flat(2).includes("Pengguna"));
  assert.ok(labels("ADMIN").flat(2).includes("Pengguna"));
  const hrefs = navGroupsFor("ADMIN").flatMap(g => g.items).flatMap(i => i.href ? [i.href] : []);
  assert.equal(activeHref("/dashboard", hrefs), "/dashboard");
  assert.equal(activeHref("/dashboard/kandidat/bank/import", hrefs), "/dashboard/kandidat/bank");
  assert.equal(activeHref("/dashboard/kandidat/abc", hrefs), "/dashboard/kandidat");
  assert.equal(activeHref("/dashboard/karyawanx", hrefs), null);
  assert.equal(initials("Dewi Anggraini"), "DA");
  assert.equal(initials("Administrator"), "AD");
  ```
- [ ] **Step 2: Run** `npx tsx <scratchpad>/check-nav.mts` → Expected: fails (module not found).
- [ ] **Step 3: Implement** `src/lib/nav.ts` and `src/app/ui/icons.tsx` as specified.
- [ ] **Step 4: Run** the check again → Expected: exits 0, no output. `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `git commit -m "Add grouped navigation model and nav icons"`

---

### Task 3: Dashboard shell (sidebar, header, phone drawer)

**Files:**
- Create: `src/app/ui/nav-drawer.tsx` (client)
- Modify: `src/app/dashboard/layout.tsx`

**Interfaces:**
- Consumes: `navGroupsFor`, `activeHref`, `initials` (Task 2), `NavIcon`, `countEndingContracts`, `AlertIcon`.
- Produces (`nav-drawer.tsx`, `"use client"`):
  - `NavDrawerProvider({ children })` — holds `open` state; closes on `usePathname()` change and on Escape; sets `document.body.style.overflow = "hidden"` while open.
  - `MenuButton()` — ☰ button, `md:hidden`, `aria-label="Buka menu"`, `aria-expanded`.
  - `Sidebar({ children })` — `<aside>` `bg-[#0f2744] w-60`: static on `md+`; below `md` fixed off-canvas (`-translate-x-full` ↔ `translate-x-0`) with a `bg-slate-900/50` backdrop button that closes it.
  - `NavLinks({ groups, badges })` — `groups: { title: string; items: { href?: string; label: string; icon: NavIconName }[] }[]`, `badges: Record<string, number>`; renders group titles (uppercase 10.5px `#7c93b0`), links with icon, active item `bg-brand-700 text-white font-semibold`, others `text-[#cbd5e1] hover:bg-white/5`; badge pill amber with `AlertIcon` and the same `title` text as today; href-less items show "Segera".

- [ ] **Step 1:** Implement `nav-drawer.tsx`. Pass only serializable props (no `roles`, no functions).
- [ ] **Step 2:** Rewrite `layout.tsx`: provider wraps the frame; `Sidebar` holds brand block ("HR" logo square `bg-brand-700` + "Portal HR") and `<Suspense><SideNav/></Suspense>`; `SideNav` (server) computes `navGroupsFor(user.role)` + badges as today and renders `NavLinks`. Header `bg-white h-16`: `MenuButton` + phone-only logo on the left; `UserMenu` on the right with avatar circle `bg-brand-700` showing `initials(user.name)`, name/role hidden below `sm`, Keluar button unchanged in behaviour. Keep `export const instant = false` and the existing comments.
- [ ] **Step 3:** `npx tsc --noEmit; npx eslint` → clean.
- [ ] **Step 4:** In the browser pane at 1440px: sidebar navy, groups correct for Admin, Karyawan badge present, active item follows navigation.
- [ ] **Step 5:** Log in as the seed HR test account and as an employee account: groups match Review Focus 2.
- [ ] **Step 6:** At 390px: ☰ opens drawer; tapping "Karyawan" navigates and the drawer is closed; Escape and backdrop close it.
- [ ] **Step 7: Commit** `git commit -m "Dark grouped sidebar with icons, avatar header and phone menu"`

---

### Task 4: Shared card, table and form styles

**Files:**
- Modify: `src/app/globals.css`
- Modify: files using `rounded-xl border border-slate-200 bg-white` (≈46 uses)
- Modify: table heads in `lowongan/page.tsx`, `surat/page.tsx`, `kandidat/bank/page.tsx`, `karyawan/page.tsx`

**Interfaces:**
- Produces: utility `card` = `border-radius:10px; border:1px solid var(--color-slate-200); background:#fff; box-shadow:0 1px 2px rgb(15 23 42 / .06)`; utility `table-head` = `bg-slate-50 text-[11.5px] uppercase tracking-wide text-slate-500` applied to `<thead>`.

- [ ] **Step 1:** Add both with `@utility` in `globals.css`.
- [ ] **Step 2:** Replace `rounded-xl border border-slate-200 bg-white` → `card` (keep any trailing classes such as `p-5`, `hover:border-brand-600`); replace the four `<thead>` class lists with `table-head border-b border-slate-200`.
- [ ] **Step 3:** `grep -rn 'rounded-xl border border-slate-200 bg-white' src` → no output; `npx tsc --noEmit; npx eslint` → clean.
- [ ] **Step 4: Commit** `git commit -m "Shared card and table-head styles"`

---

### Task 5: Ringkasan page

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `NavIcon` (Task 2), `card` (Task 4).

- [ ] **Step 1:** Each entry of `stats` gets an `icon: NavIconName` (`brief`, `users`, a calendar icon added to `icons.tsx` as `"cal"`, `bank`). Stat card: `card border-l-4 border-l-brand-700 p-4 flex items-center gap-3.5`, icon tile `size-11 rounded-lg bg-brand-100 text-brand-700`, value `text-[26px] font-bold`. Grid `grid-cols-2 lg:grid-cols-4` with `[grid-template-columns:repeat(2,minmax(0,1fr))]` below `lg`.
- [ ] **Step 2:** Interview list item: date tile `w-12 rounded-lg bg-brand-100 text-brand-700 text-center` with day and short month from `Intl.DateTimeFormat("id-ID", { day: "numeric" | month: "short", timeZone: "Asia/Jakarta" })` next to the existing name/job/time text. Contract panel unchanged except classes. Queries untouched.
- [ ] **Step 3:** `npx tsc --noEmit; npx eslint` → clean; page renders for Admin and for an employee (employee sees no stats, as today).
- [ ] **Step 4: Commit** `git commit -m "Ringkasan: stat cards with icons and date tiles"`

---

### Task 6: Karyawan table

**Files:**
- Modify: `src/app/dashboard/karyawan/page.tsx`

- [ ] **Step 1:** Name cell: avatar circle `size-8 bg-brand-700 text-white text-[11.5px] font-bold` with `initials(e.fullName)` beside the existing link + position. Columns No. induk, Departemen, Jenis, Status, Mulai get `hidden md:table-cell` on both `<th>` and `<td>`. Status text becomes a pill: `bg-green-100 text-green-800` for active statuses, `bg-slate-100 text-slate-600` otherwise (use the existing status enum; no new labels). Row tint for alerts unchanged.
- [ ] **Step 2:** `npx tsc --noEmit; npx eslint` → clean; at 390px only Nama and Kontrak berakhir columns show.
- [ ] **Step 3: Commit** `git commit -m "Karyawan list: avatars, status pills, compact phone columns"`

---

### Task 7: Full verification and user review

- [ ] **Step 1:** `node shoot.mjs after` → 22 PNGs; every phone line prints `scrollWidth <= 390`.
- [ ] **Step 2:** Click-test in the browser pane: login, each menu item, one form save (Akun Saya → wrong current password shows the error, nothing saved), ☰ open/close/Escape at 390px, logout.
- [ ] **Step 3:** Pair before/after screenshots (Ringkasan, Karyawan, Lowongan, Login, Karir at both sizes) and send them to the user with SendUserFile.
- [ ] **Step 4:** Wait for the user's OK; fix anything raised, re-shoot the affected pages.
- [ ] **Step 5:** Update `README.md` only if it describes the old teal look or nav (grep `teal`, `menu`).
- [ ] **Step 6:** After the user's OK: `git switch main; git merge --ff-only redesign-korporat-biru`. No push.
