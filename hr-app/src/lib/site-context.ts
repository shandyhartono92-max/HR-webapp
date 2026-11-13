import { AsyncLocalStorage } from "node:async_hooks";
import { siteByCode, type SiteCode } from "@/lib/sites";

// An explicit location for code that runs without a signed-in session: the hourly
// jobs, the public careers page, scripts. Inside withSite(), siteDb() uses this
// location instead of reading the session cookie.

const storage = new AsyncLocalStorage<SiteCode>();

export async function withSite<T>(site: SiteCode, fn: () => Promise<T>): Promise<T> {
  if (!siteByCode(site)) throw new Error(`Lokasi tidak dikenal: ${site}`);
  return storage.run(site, fn);
}

export const scopedSite = (): SiteCode | undefined => storage.getStore();
