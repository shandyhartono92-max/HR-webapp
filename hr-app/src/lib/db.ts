import "server-only";
import { cookies } from "next/headers";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";
import { mariadbConfig } from "./db-config";
import { siteByCode, type Site, type SiteCode } from "./sites";
import { scopedSite } from "./site-context";
import { readSession, SESSION_COOKIE, SESSION_REJECTED_PARAM } from "./session-token";

// Every location has its own database with the same schema. Code asks for the
// database of the location it works for: siteDb() inside a request (the location in
// the signed session, or the one set by withSite()), dbFor(code) when it names one.

// One client per location, reused across hot reloads in development
const globalForPrisma = globalThis as unknown as { prismaSites?: Map<SiteCode, PrismaClient> };
const clients = globalForPrisma.prismaSites ?? new Map<SiteCode, PrismaClient>();
if (process.env.NODE_ENV !== "production") globalForPrisma.prismaSites = clients;

export function dbFor(code: SiteCode): PrismaClient {
  const site = siteByCode(code);
  if (!site) throw new Error(`Lokasi tidak dikenal: ${code}`);
  let client = clients.get(site.code);
  if (!client) {
    client = new PrismaClient({ adapter: new PrismaMariaDb(mariadbConfig(site.databaseUrl)) });
    clients.set(site.code, client);
  }
  return client;
}

// The location this code works for: an explicit withSite() scope first, then the session.
// Without either (signed out, or a cookie from before locations) the request goes to
// the login page, the same way requireUser() handles a refused session.
export async function currentSite(): Promise<Site> {
  const scoped = scopedSite();
  if (scoped) return siteByCode(scoped)!;
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  const site = session ? siteByCode(session.site) : null;
  if (!site) {
    // Loaded here only: scripts (always inside withSite) cannot load next/navigation
    const { redirect } = await import("next/navigation");
    return redirect(`/login?${SESSION_REJECTED_PARAM}=1`);
  }
  return site;
}

export const siteDb = async (): Promise<PrismaClient> => dbFor((await currentSite()).code);
