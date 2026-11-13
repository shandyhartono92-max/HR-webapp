import type { Metadata } from "next";
import Link from "next/link";
import { currentSite, dbFor } from "@/lib/db";
import { accountsDb } from "@/lib/accounts-db";
import { requireRole } from "@/lib/dal";
import { employeeStatusLabel, formatDate, roleLabel } from "@/lib/labels";
import { sites } from "@/lib/sites";
import type { Role } from "@/generated/prisma/enums";
import { AccessForm, CreateUserForm, EditUserForm, UserActions } from "./user-forms";

export const metadata: Metadata = { title: "Kelola pengguna" };
export const instant = false; // waits for the session check, see dashboard/layout.tsx

// Accounts live in the accounts database and are managed from any location; each
// row shows and edits the account's access per location.
export default async function UsersPage() {
  const me = await requireRole("ADMIN");
  const here = await currentSite();
  const allSites = sites();

  const accounts = await accountsDb.account.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, isActive: true, mustChangePassword: true, lastLoginAt: true, access: { select: { site: true, role: true } } },
  });
  const ids = accounts.map((a) => a.id);
  // Linked employee records per location (a location that is down shows none)
  const employeesBySite = new Map(
    await Promise.all(
      allSites.map(async (s) => {
        const rows = await dbFor(s.code)
          .employee.findMany({ where: { userId: { in: ids } }, select: { id: true, userId: true, employeeNumber: true, status: true, anonymizedAt: true } })
          .catch(() => []);
        return [s.code, new Map(rows.map((r) => [r.userId!, r]))] as const;
      }),
    ),
  );
  const users = accounts.map((a) => ({
    ...a,
    role: (a.access.find((x) => x.site === here.code)?.role ?? null) as Role | null,
    employee: employeesBySite.get(here.code)?.get(a.id) ?? null,
    sites: allSites.map((s) => ({
      code: s.code,
      label: s.label,
      role: (a.access.find((x) => x.site === s.code)?.role ?? null) as Role | null,
      linkedEmployee: Boolean(employeesBySite.get(s.code)?.get(a.id)),
    })),
  }));
  const staffCount = users.filter((u) => u.isActive && (u.role === "ADMIN" || u.role === "HR")).length;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Kelola pengguna</h1>
        <p className="mt-1 text-sm text-slate-600">Hanya Admin yang bisa membuka halaman ini. Setiap perubahan tercatat di log audit.</p>
      </div>

      {staffCount < 2 && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Baru ada {staffCount} akun HR/Admin aktif. Rekening yang diinput HR harus disetujui HR/Admin lain, jadi sebaiknya ada minimal 2 akun.
        </p>
      )}

      <section className="card p-5">
        <h2 className="mb-3 font-medium text-slate-900">Tambah pengguna</h2>
        <CreateUserForm />
      </section>

      <section className="card p-5">
        <h2 className="font-medium text-slate-900">Semua pengguna ({users.length})</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {users.map((u) => {
            const isSelf = u.id === me.id;
            const anonymized = Boolean(u.employee?.anonymizedAt);
            const left = u.employee && u.employee.status !== "ACTIVE" && u.employee.status !== "PROBATION";
            return (
              <li key={u.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-slate-900">
                      {u.name}
                      {isSelf && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">Anda</span>}
                    </p>
                    <p className="break-all text-slate-600">{u.email}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Login terakhir: {u.lastLoginAt ? formatDate(u.lastLoginAt) : "belum pernah"}
                      {u.employee && !anonymized && (
                        <>
                          {" · "}
                          <Link href={`/dashboard/karyawan/${u.employee.id}`} className="text-brand-700 hover:underline">
                            Karyawan {u.employee.employeeNumber}
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
                    {u.sites.map((s) => (
                      <span
                        key={s.code}
                        className={`rounded-full px-2.5 py-0.5 ${s.role ? "bg-brand-50 text-brand-800" : "bg-slate-100 text-slate-500"}`}
                      >
                        {s.label}: {s.role ? roleLabel[s.role] : "—"}
                      </span>
                    ))}
                    {!u.isActive && <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-slate-700">Nonaktif</span>}
                    {u.isActive && u.mustChangePassword && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-800">Belum ganti kata sandi</span>
                    )}
                    {u.isActive && left && (
                      <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-red-800">
                        Karyawan: {employeeStatusLabel[u.employee!.status]}, akun masih aktif
                      </span>
                    )}
                  </div>
                </div>
                {anonymized ? (
                  <p className="mt-2 text-xs text-slate-500">Datanya sudah dianonimkan; akun ini tidak bisa dipakai lagi.</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {!isSelf && <UserActions userId={u.id} name={u.name} isActive={u.isActive} />}
                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-brand-800">Akses lokasi dan peran</summary>
                      <div className="mt-3">
                        <AccessForm accountId={u.id} sites={u.sites} />
                      </div>
                    </details>
                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-brand-800">Ubah nama atau email</summary>
                      <div className="mt-3">
                        <EditUserForm user={u} linked={Boolean(u.employee)} />
                      </div>
                    </details>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
