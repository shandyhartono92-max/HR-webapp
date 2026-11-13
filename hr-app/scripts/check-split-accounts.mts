// Copies site users into the accounts database. Runs against the accounts SHADOW
// database (emptied first), never the real one.
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient as AccountsClient } from "@/generated/accounts/client";
import { mariadbConfig } from "@/lib/db-config";
import { splitAccounts, type SourceUser } from "@/lib/account-split";

const shadow = process.env.ACCOUNTS_SHADOW_DATABASE_URL;
assert.ok(shadow, "ACCOUNTS_SHADOW_DATABASE_URL is needed");
execSync("npx prisma migrate deploy --config prisma.accounts.config.ts", { stdio: "ignore", env: { ...process.env, ACCOUNTS_DATABASE_URL: shadow, ACCOUNTS_SHADOW_DATABASE_URL: "" } });
const to = new AccountsClient({ adapter: new PrismaMariaDb(mariadbConfig(shadow)) });
await to.loginEvent.deleteMany();
await to.siteAccess.deleteMany();
await to.account.deleteMany();

const users: SourceUser[] = [
  { id: "u-admin", email: "admin@contoh.local", name: "Admin", role: "ADMIN", passwordHash: "hash-1", mustChangePassword: false, isActive: true, lastLoginAt: new Date("2026-11-01T08:00:00Z"), createdAt: new Date("2026-10-01T00:00:00Z") },
  { id: "u-off", email: "lama@contoh.local", name: "Sudah Nonaktif", role: "HR", passwordHash: "hash-2", mustChangePassword: false, isActive: false, lastLoginAt: null, createdAt: new Date("2026-10-02T00:00:00Z") },
  { id: "u-new", email: "baru@contoh.local", name: "Karyawan Baru", role: "EMPLOYEE", passwordHash: "hash-3", mustChangePassword: true, isActive: true, lastLoginAt: null, createdAt: new Date("2026-10-03T00:00:00Z") },
];
const from = { user: { findMany: async () => users } };

// ── First run copies everyone, with their role as access to the site ──
assert.deepEqual(await splitAccounts(from, to, "batam"), { copied: 3, existing: 0, total: 3 });
const accounts = await to.account.findMany({ orderBy: { createdAt: "asc" } });
assert.deepEqual(
  accounts.map((a) => [a.id, a.email, a.name, a.passwordHash, a.mustChangePassword, a.isActive, a.lastLoginAt?.toISOString() ?? null]),
  [
    ["u-admin", "admin@contoh.local", "Admin", "hash-1", false, true, "2026-11-01T08:00:00.000Z"],
    ["u-off", "lama@contoh.local", "Sudah Nonaktif", "hash-2", false, false, null],
    ["u-new", "baru@contoh.local", "Karyawan Baru", "hash-3", true, true, null],
  ],
);
const access = await to.siteAccess.findMany({ orderBy: { accountId: "asc" } });
assert.deepEqual(access.map((a) => [a.accountId, a.site, a.role]), [
  ["u-admin", "batam", "ADMIN"],
  ["u-new", "batam", "EMPLOYEE"],
  ["u-off", "batam", "HR"],
]);

// ── Running again changes nothing ───────────────────────────
assert.deepEqual(await splitAccounts(from, to, "batam"), { copied: 0, existing: 3, total: 3 });
assert.equal(await to.siteAccess.count(), 3);
assert.equal(await to.account.count(), 3);

await to.$disconnect();
console.log("check-split-accounts: ok");
