# Tenaga Kerja Asing (TKA) — Design (short)

Date: 2026-11-13 · Status: awaiting approval

## Why

HR must never let a foreign worker's KITAS expire unnoticed. Foreign workers are recorded for
information only: no contracts, letters, payroll or logins.

## What the user decided

- A separate list under the Karyawan menu group, much simpler than an employee record. Fields:
  nama, nomor paspor, nomor KITAS, masa berlaku paspor, masa berlaku KITAS, lokasi (free text).
- Alerts count **KITAS expiry only**, starting **1 month** before it. Passport expiry is shown, never alerted.
- Passport and KITAS numbers are stored as plain text (no encryption).
- A worker who has gone home or does not continue is set to **Non Aktif**; the record stays and raises
  no more alerts.

## Approaches

- **A. Own table and menu (chosen).** New `ForeignWorker` table in each location database, its own
  pages and menu entry. Simple, leaves the employee data untouched; "foreign workers are information only".
- B. A flag on the existing Employee table. Rejected: employees require Employee ID, department,
  contract type, HO/OPS location and more, which do not apply, and loosening those rules risks a stable feature.

## Design (my calls, open to correction)

- **Data** (location database, so Batam and Jakarta stay separate): `ForeignWorker` with fullName,
  passportNumber, kitasNumber, passportExpiry (date), kitasExpiry (date), location (free text, max 120),
  status (ACTIVE / INACTIVE, default ACTIVE), two notice markers (below), timestamps. All six fields are
  required. Passport and KITAS numbers are unique within a location; a duplicate is refused with a message.
- **Screen**: menu **Tenaga Kerja Asing** in the Karyawan group, for Admin and HR, with an alert badge.
  `/dashboard/tka`: a list (name, passport, KITAS, passport expiry, KITAS expiry with an alert tag, lokasi,
  status), filter Aktif / Non Aktif / Semua (default Aktif), sorted by KITAS expiry. A yellow banner when
  KITAS of active workers expire within 30 days or have expired ("Lihat daftarnya" filters them).
  "Tambah TKA" form; each row opens an edit form where HR updates the numbers and dates after a renewal and
  can set Non Aktif / Aktif. No delete (Non Aktif instead). Works at phone width.
- **Alert rule**: active worker, KITAS expiry within 30 days → "soon" (yellow); past → "lewat" (red).
  Same look as the contract alerts.
- **Notifications**: the hourly background job checks every location. For each active worker it sends the
  location's active HR and Admin users one in-app notification (shown on Ringkasan) when the KITAS enters
  the 30-day window, and one when it has expired. Markers on the record prevent repeats and are cleared
  when the KITAS expiry date changes (a renewal), so the next cycle is notified again.
- **Audit**: adding, editing and changing status are written to the audit log (field names only).
- **Not now**: email notifications (email sending is parked), Excel import/export, document scans,
  linking to employee records, a retention rule for former foreign workers.
- **Guides**: the HR guide gets a TKA section and an FAQ row.

## Left to the builder

Exact component split, the alert helper's shape (mirroring `src/lib/contracts.ts`), migration name.
