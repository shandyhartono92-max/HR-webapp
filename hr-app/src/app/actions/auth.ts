"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";
import { getCurrentUser } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";

const LoginSchema = z.object({
  email: z.email({ error: "Masukkan email yang valid." }).trim().toLowerCase(),
  password: z.string().min(1, { error: "Kata sandi wajib diisi." }),
});

export type LoginState = { error?: string; email?: string } | undefined;

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message, email: String(formData.get("email") ?? "") };
  }

  const { email, password } = parsed.data;
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, role: true, isActive: true, passwordHash: true },
  });

  // Same message for unknown email and wrong password
  const ok = user?.isActive && (await bcrypt.compare(password, user.passwordHash));
  if (!user || !ok) {
    await writeAudit({ actorId: null, action: "auth.login_failed", entityType: "User", entityId: email });
    return { error: "Email atau kata sandi salah.", email };
  }

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await writeAudit({ actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id });
  await createSession({ userId: user.id, role: user.role });
  redirect("/dashboard");
}

export async function logout() {
  const user = await getCurrentUser();
  if (user) await writeAudit({ actorId: user.id, action: "auth.logout", entityType: "User", entityId: user.id });
  await deleteSession();
  redirect("/login");
}
