// The guard before the user_mirror migration: it must stop on anything it cannot check.
import assert from "node:assert/strict";
import { mirrorMigrationGuard } from "@/lib/migration-guard";

const tableMissing = Object.assign(new Error("Table 'portal_hr_x._prisma_migrations' doesn't exist"), { meta: { code: "1146" } });
const connectionLost = Object.assign(new Error("Connection lost"), { code: "ECONNRESET" });

type Rows = unknown[] | Error;
const fakeDb = (migrations: Rows, users: Rows) => ({
  $queryRawUnsafe: async (sql: string) => {
    const r = sql.includes("_prisma_migrations") ? migrations : users;
    if (r instanceof Error) throw r;
    return r;
  },
});
const known = (ids: string[]) => async (asked: string[]) => asked.filter((id) => ids.includes(id));

// Already applied: nothing to check
assert.deepEqual(await mirrorMigrationGuard(fakeDb([{ n: BigInt(1) }], []), known([])), { ok: true });
// Not applied yet, every user has an account: go ahead
assert.deepEqual(await mirrorMigrationGuard(fakeDb([{ n: BigInt(0) }], [{ id: "a" }, { id: "b" }]), known(["a", "b"])), { ok: true });
// Not applied yet, a user without an account: refuse and name it
assert.deepEqual(await mirrorMigrationGuard(fakeDb([{ n: BigInt(0) }], [{ id: "a" }, { id: "b" }]), known(["a"])), { ok: false, missing: ["b"] });
// A brand-new database (no tables yet): nothing to lose, go ahead
assert.deepEqual(await mirrorMigrationGuard(fakeDb(tableMissing, tableMissing), known([])), { ok: true });
// Any other error while checking: stop, never assume it is safe
assert.deepEqual(await mirrorMigrationGuard(fakeDb(connectionLost, []), known([])), { ok: false, error: "Connection lost" });
assert.deepEqual(await mirrorMigrationGuard(fakeDb([{ n: BigInt(0) }], connectionLost), known([])), { ok: false, error: "Connection lost" });

console.log("check-migration-guard: ok");
