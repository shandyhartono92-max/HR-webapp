// Prisma `where` filters that ignore upper/lower case.
// The database uses the utf8mb4_unicode_ci collation, so a plain comparison already
// ignores case ("uji-001" = "UJI-001"), and unique columns reject such duplicates.
// These helpers keep that intent visible at the call sites.
export function anyEqualsIgnoringCase<F extends string>(field: F, values: string[]) {
  return { OR: values.map((v) => ({ [field]: { equals: v } }) as Record<F, { equals: string }>) };
}

export const equalsIgnoringCase = (value: string) => ({ equals: value });
