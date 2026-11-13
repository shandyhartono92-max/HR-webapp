// Signing and verifying the session token. No server-only import, because
// proxy.ts uses it too.
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/generated/prisma/enums";
import { siteByCode, type SiteCode } from "@/lib/sites";

export const SESSION_COOKIE = "hr_session";
export const SESSION_HOURS = 8; // one working day
// On /login: the database refused this session, so proxy.ts must clear the cookie
export const SESSION_REJECTED_PARAM = "sesi_ditolak";

export type SessionPayload = {
  userId: string;
  role: Role;
  // The location this session works in; signed, so it cannot be changed in the browser
  site: SiteCode;
};

const encodedKey = new TextEncoder().encode(process.env.SESSION_SECRET);

export async function signSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(encodedKey);
}

export async function readSession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, encodedKey, { algorithms: ["HS256"] });
    // Sessions from before locations existed, or for a location no longer configured
    if (!siteByCode(payload.site)) return null;
    return { userId: payload.userId, role: payload.role, site: payload.site };
  } catch {
    return null;
  }
}
