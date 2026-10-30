import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/session-token";

// Optimistic check only (cookie, no database). Real access checks live in src/lib/dal.ts.
export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);

  if (path.startsWith("/dashboard") && !session) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  if (path === "/login" && session) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
