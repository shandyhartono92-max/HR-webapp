import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_HOURS, signSession, type SessionPayload } from "@/lib/session-token";

export async function createSession(payload: SessionPayload) {
  const token = await signSession(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000),
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
