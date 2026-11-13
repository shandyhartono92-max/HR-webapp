// The guard scripts/migrate-sites.mts runs before the user_mirror migration, which drops
// the password columns from a location's `user` table: every user there must already
// have an account in the accounts database. Anything it cannot check stops the
// migration; only a brand-new database (no tables yet) has nothing to lose.
// Checked by scripts/check-migration-guard.mts.

export const MIRROR_MIGRATION = "20261113100000_user_mirror";

type Raw = { $queryRawUnsafe(sql: string, ...values: unknown[]): Promise<unknown> };
export type GuardResult = { ok: true } | { ok: false; missing: string[] } | { ok: false; error: string };

// MariaDB error 1146 "Table … doesn't exist", as Prisma and the driver adapter report it
const tableMissing = (e: unknown) => {
  const text = `${e instanceof Error ? e.message : ""} ${JSON.stringify((e as { meta?: unknown })?.meta ?? "")}`;
  return /1146|doesn't exist|TableDoesNotExist/i.test(text);
};

export async function mirrorMigrationGuard(db: Raw, knownAccounts: (ids: string[]) => Promise<string[]>): Promise<GuardResult> {
  let users: { id: string }[];
  try {
    const applied = (await db.$queryRawUnsafe(
      "SELECT COUNT(*) AS n FROM `_prisma_migrations` WHERE migration_name = ? AND finished_at IS NOT NULL",
      MIRROR_MIGRATION,
    )) as { n: bigint | number }[];
    if (Number(applied[0]?.n ?? 0) > 0) return { ok: true };
    users = (await db.$queryRawUnsafe("SELECT id FROM `user`")) as { id: string }[];
  } catch (e) {
    if (tableMissing(e)) return { ok: true };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const known = new Set(await knownAccounts(users.map((u) => u.id)));
  const missing = users.map((u) => u.id).filter((id) => !known.has(id));
  return missing.length ? { ok: false, missing } : { ok: true };
}
