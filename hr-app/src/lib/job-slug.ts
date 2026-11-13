// The job's address on the careers page (/karir/<location>/<slug>), from its title.
// A slug equal to a location code is prefixed, so /karir/<code> always means that
// location's job list. Pure; checked by scripts/check-job-slug.mts.
export function slugify(title: string, reserved: string[]): string {
  const base =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "lowongan";
  return reserved.includes(base) ? `lowongan-${base}` : base;
}
