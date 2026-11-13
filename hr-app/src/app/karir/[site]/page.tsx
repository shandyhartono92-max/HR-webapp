import { notFound, permanentRedirect } from "next/navigation";
import { dbFor } from "@/lib/db";
import { siteByCode } from "@/lib/sites";
import { jobUrl } from "@/lib/careers";

export const instant = false; // looks the job up per request

// One segment after /karir is either a location (/karir/jakarta → its jobs), or a job
// link from before locations existed (/karir/<slug>). Every job then belonged to
// Batam, the original database, so old links go there.
const LEGACY_SITE = "batam";

export default async function CareersShortLink({ params }: PageProps<"/karir/[site]">) {
  const { site: segment } = await params;
  if (siteByCode(segment)) permanentRedirect(`/karir?lokasi=${segment}`);
  if (!siteByCode(LEGACY_SITE)) notFound();
  const job = await dbFor(LEGACY_SITE)
    .job.findFirst({ where: { slug: segment }, select: { slug: true } })
    .catch(() => null);
  if (!job) notFound();
  permanentRedirect(jobUrl(LEGACY_SITE, job.slug));
}
