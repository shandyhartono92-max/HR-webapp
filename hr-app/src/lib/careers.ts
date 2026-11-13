import "server-only";
import { dbFor } from "@/lib/db";
import { sites, type SiteCode } from "@/lib/sites";
import type { EmploymentType } from "@/generated/prisma/enums";

// The public careers page lists the open jobs of every location. A location whose
// database is down is left out and named in `unavailable`; the others still show.

export type PublicJob = {
  id: string;
  slug: string;
  title: string;
  location: string;
  employmentType: EmploymentType;
  department: { name: string };
  openedAt: Date | null;
  site: SiteCode;
  siteLabel: string;
};

// A database that is down can take the driver ~10 s to give up on; applicants should
// not wait for it, so each location gets this long before it counts as unavailable
const SITE_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`lebih dari ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function openJobsAllSites(): Promise<{ jobs: PublicJob[]; unavailable: string[] }> {
  const results = await Promise.all(
    sites().map(async (site) => {
      try {
        const rows = await withTimeout(
          dbFor(site.code).job.findMany({
            where: { status: "OPEN" },
            select: { id: true, slug: true, title: true, location: true, employmentType: true, openedAt: true, department: { select: { name: true } } },
          }),
          SITE_TIMEOUT_MS,
        );
        return { site, jobs: rows.map((j) => ({ ...j, site: site.code, siteLabel: site.label })) };
      } catch (e) {
        console.error(`[karir] lowongan ${site.code} tidak bisa dibaca:`, e instanceof Error ? e.message : e);
        return { site, jobs: null };
      }
    }),
  );
  const jobs = results
    .flatMap((r) => r.jobs ?? [])
    .sort((a, b) => (b.openedAt?.getTime() ?? 0) - (a.openedAt?.getTime() ?? 0));
  return { jobs, unavailable: results.filter((r) => r.jobs === null).map((r) => r.site.label) };
}

// Public address of a job
export const jobUrl = (site: SiteCode, slug: string) => `/karir/${site}/${slug}`;
