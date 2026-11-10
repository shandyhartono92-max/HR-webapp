import "server-only";
import { db } from "@/lib/db";
import { todayDate } from "@/lib/labels";
import { equalsIgnoringCase } from "@/lib/match";
import { graduatedNumber, trainingOver } from "@/lib/training";
import { Prisma } from "@/generated/prisma/client";

// Drops the T from trainees' employee numbers the day after their training ends.
// Runs inside the app (src/instrumentation.ts) at start-up and every hour, so it
// needs no scheduler. If the new number is taken, the T stays and HR/Admin get a
// notification to pick one by hand (Ubah identitas).

export type GraduationResult = { graduated: { from: string; to: string }[]; clashes: { employeeNumber: string; wanted: string }[] };

const CLASH_TYPE = "training.id_clash";

export async function graduateTrainees(today = todayDate()): Promise<GraduationResult> {
  const result: GraduationResult = { graduated: [], clashes: [] };
  const due = await db.employee.findMany({
    where: { traineeNumber: null, anonymizedAt: null, trainingEnd: { lt: today }, employeeNumber: { startsWith: "T" } },
    select: { id: true, employeeNumber: true, fullName: true, trainingEnd: true },
  });

  for (const emp of due) {
    const wanted = graduatedNumber(emp.employeeNumber);
    if (!wanted || !emp.trainingEnd || !trainingOver(emp.trainingEnd, today)) continue;

    const taken = await db.employee.findFirst({
      where: { id: { not: emp.id }, OR: [{ employeeNumber: equalsIgnoringCase(wanted) }, { traineeNumber: equalsIgnoringCase(wanted) }] },
      select: { id: true },
    });
    let moved = false;
    if (!taken) {
      try {
        moved = await db.$transaction(async (tx) => {
          // Guarded: an HR edit or a second run in between leaves nothing to move
          const changed = await tx.employee.updateMany({
            where: { id: emp.id, employeeNumber: emp.employeeNumber, traineeNumber: null },
            data: { employeeNumber: wanted, traineeNumber: emp.employeeNumber },
          });
          if (changed.count === 0) return false;
          await tx.auditLog.create({
            data: {
              actorId: null,
              action: "employee.training_completed",
              entityType: "Employee",
              entityId: emp.id,
              changes: { employeeNumber: { from: emp.employeeNumber, to: wanted }, trainingEnd: emp.trainingEnd!.toISOString().slice(0, 10) },
            },
          });
          return true;
        });
      } catch (e) {
        // Unique index: someone took the number between the check and the update
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      }
    }

    if (moved) {
      result.graduated.push({ from: emp.employeeNumber, to: wanted });
    } else {
      const fresh = await db.employee.findUnique({ where: { id: emp.id }, select: { employeeNumber: true, traineeNumber: true } });
      if (fresh?.traineeNumber || fresh?.employeeNumber !== emp.employeeNumber) continue; // changed meanwhile
      result.clashes.push({ employeeNumber: emp.employeeNumber, wanted });
      await notifyClash(emp.id, emp.fullName, emp.employeeNumber, wanted);
    }
  }
  return result;
}

// Once per employee: the notification stays until someone fixes the number
async function notifyClash(employeeId: string, fullName: string, current: string, wanted: string) {
  const link = `/dashboard/karyawan/${employeeId}`;
  const already = await db.notification.findFirst({ where: { type: CLASH_TYPE, link }, select: { id: true } });
  if (already) return;
  const staff = await db.user.findMany({ where: { role: { in: ["ADMIN", "HR"] }, isActive: true }, select: { id: true } });
  if (staff.length === 0) return;
  await db.notification.createMany({
    data: staff.map((u) => ({
      userId: u.id,
      type: CLASH_TYPE,
      title: "Training selesai, Employee ID belum bisa diganti",
      // Starts with "<name> · " so retention can find it (src/lib/retention.ts)
      body: `${fullName} · ${current} seharusnya menjadi ${wanted}, tetapi ${wanted} sudah dipakai. Pilih Employee ID lain lewat Ubah identitas.`,
      link,
    })),
  });
}
