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

// Whether the session cookie is marked secure (sent over https only). Secure in
// production by default; browsers drop secure cookies on plain http (except localhost),
// so a server reached by http on an internal IP sets SESSION_COOKIE_SECURE="false".
// Checked by scripts/check-cookie-secure.mts.
export function sessionCookieSecure(env: Record<string, string | undefined> = process.env): boolean {
  const value = env.SESSION_COOKIE_SECURE?.trim().toLowerCase();
  if (value === "false") return false;
  if (value === "true") return true;
  return env.NODE_ENV === "production";
}

const encodedKey =new TextEncoder().encode(process.env.SESSION_SECRET);

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
