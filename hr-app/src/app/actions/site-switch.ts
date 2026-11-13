"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { currentSite } from "@/lib/db";
import { accountsDb } from "@/lib/accounts-db";
import { accessError } from "@/lib/access-rules";
import { logLogin, syncMirror } from "@/lib/site-access";
import { createSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { LAST_SITE_COOKIE, siteByCode } from "@/lib/sites";
import { withSite } from "@/lib/site-context";
import type { Role } from "@/generated/prisma/enums";

export type SwitchState = { error?: string } | undefined;

const labelOf = (code: string) => siteByCode(code)?.label ?? code;

// Opens another location without typing the password again. Access is checked
// again here: it may have been removed since the user signed in.
export async function switchSite(_state: SwitchState, formData: FormData): Promise<SwitchState> {
  const user = await requireUser({ allowPasswordChange: true });
  const from = (await currentSite()).code;
  const target = siteByCode(formData.get("site"));
  if (!target || target.code === from) return { error: "Lokasi tidak dikenal." };

  const access = await accountsDb.siteAccess.findMany({ where: { accountId: user.id }, select: { site: true, role: true } });
  const refused = accessError(access, target.code, labelOf);
  if (refused) return { error: refused };

  try {
    await syncMirror(user.id, target.code);
    await withSite(target.code, () =>
      writeAudit({ actorId: user.id, action: "auth.switch_site", entityType: "User", entityId: user.id, changes: { from } }),
    );
  } catch (e) {
    console.error(`[pindah lokasi] ${target.code} tidak bisa diakses:`, e instanceof Error ? e.message : e);
    return { error: `Lokasi ${target.label} sedang tidak bisa diakses. Coba lagi nanti.` };
  }

  await logLogin("SWITCH", user.id, target.code);
  const role = access.find((a) => a.site === target.code)!.role as Role;
  await createSession({ userId: user.id, role, site: target.code });
  (await cookies()).set(LAST_SITE_COOKIE, target.code, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard");
}
