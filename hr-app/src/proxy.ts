import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE, SESSION_REJECTED_PARAM } from "@/lib/session-token";

// Optimistic check only (cookie, no database). Real access checks live in src/lib/dal.ts.
export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);

  if (path.startsWith("/dashboard") && !session) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  if (path === "/login" && session) {
    // The cookie is valid but the database refused it (e.g. the account was deactivated):
    // drop it, otherwise /login and /dashboard would redirect to each other forever
    if (req.nextUrl.searchParams.has(SESSION_REJECTED_PARAM)) {
      const res = NextResponse.redirect(new URL("/login", req.nextUrl));
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
