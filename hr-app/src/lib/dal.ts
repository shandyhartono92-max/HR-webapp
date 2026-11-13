import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { dbFor, siteDb } from "@/lib/db";
import { accountsDb } from "@/lib/accounts-db";
import { readSession, SESSION_COOKIE, SESSION_REJECTED_PARAM } from "@/lib/session-token";
import type { Role } from "@/generated/prisma/enums";

// Data Access Layer: every page and server action checks access here,
// not only in proxy.ts. The databases are the source of truth: the role and
// active status of the location's mirror user (inactive once access is removed),
// and the account itself (deactivated, temporary password). Either change locks
// the user out on the next request.

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await readSession(token);
  if (!session) return null;

  const [user, account] = await Promise.all([
    dbFor(session.site).user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        employee: { select: { id: true } }, // set when the user is linked to an employee record
      },
    }),
    accountsDb.account.findUnique({ where: { id: session.userId }, select: { isActive: true, mustChangePassword: true } }),
  ]);
  if (!user || !user.isActive || !account?.isActive) return null;
  return { ...user, mustChangePassword: account.mustChangePassword, site: session.site };
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export const CHANGE_PASSWORD_PATH = "/dashboard/akun";

// Users with a temporary password can only reach the change-password page.
// Pass allowPasswordChange for that page and for layout chrome (nav, user menu).
export async function requireUser(opts: { allowPasswordChange?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?${SESSION_REJECTED_PARAM}=1`); // proxy.ts clears the cookie
  if (user.mustChangePassword && !opts.allowPasswordChange) redirect(CHANGE_PASSWORD_PATH);
  return user;
}

// Admin/HR see every application. A hiring manager sees applications for their
// own jobs, and anyone assigned as an interviewer sees that one application.
export async function canAccessApplication(user: CurrentUser, applicationId: string) {
  const db = await siteDb();
  if (user.role === "ADMIN" || user.role === "HR") return true;
  const app = await db.application.findFirst({
    where: {
      id: applicationId,
      OR: [
        ...(user.role === "HIRING_MANAGER" ? [{ job: { hiringManagerId: user.id } }] : []),
        { interviews: { some: { interviewerId: user.id } } },
      ],
    },
    select: { id: true },
  });
  return Boolean(app);
}

// Can change stage, schedule interviews, record HR decisions
export async function canManageApplication(user: CurrentUser, applicationId: string) {
  const db = await siteDb();
  if (user.role === "ADMIN" || user.role === "HR") return true;
  if (user.role !== "HIRING_MANAGER") return false;
  const app = await db.application.findFirst({
    where: { id: applicationId, job: { hiringManagerId: user.id } },
    select: { id: true },
  });
  return Boolean(app);
}

export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard?akses=ditolak");
  return user;
}
