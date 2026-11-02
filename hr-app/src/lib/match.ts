// Prisma `where` that matches a text column against any of `values`, ignoring case.
// Unique columns like employeeNumber are case-sensitive in the database, so
// "uji-001" and "UJI-001" must be compared this way to catch duplicates.
export function anyEqualsIgnoringCase<F extends string>(field: F, values: string[]) {
  return {
    OR: values.map((v) => ({ [field]: { equals: v, mode: "insensitive" as const } }) as Record<F, { equals: string; mode: "insensitive" }>),
  };
}

export const equalsIgnoringCase = (value: string) => ({ equals: value, mode: "insensitive" as const });
