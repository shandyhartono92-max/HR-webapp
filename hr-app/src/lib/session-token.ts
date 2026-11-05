// Signing and verifying the session token. No server-only import, because
// proxy.ts uses it too.
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/generated/prisma/enums";

export const SESSION_COOKIE = "hr_session";
export const SESSION_HOURS = 8; // one working day
// On /login: the database refused this session, so proxy.ts must clear the cookie
export const SESSION_REJECTED_PARAM = "sesi_ditolak";

export type SessionPayload = {
  userId: string;
  role: Role;
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
    return { userId: payload.userId, role: payload.role };
  } catch {
    return null;
  }
}
