import "server-only";
import { siteDb } from "@/lib/db";
import { formatDate, todayDate } from "@/lib/labels";
import { KITAS_ALERT_DAYS, kitasNoticeDue } from "@/lib/foreign-workers";

// Hourly (src/lib/background-jobs.ts), for the current location: tells the location's
// active HR and Admin users once when a foreign worker's KITAS enters the 30-day window
// and once when it has expired. Markers on the worker stop repeats; a new KITAS date
// clears them (src/app/actions/foreign-workers.ts).

const DAY_MS = 24 * 60 * 60 * 1000;
const notice = {
  soon: { type: "kitas_soon", title: "KITAS segera habis", marker: "kitasSoonNoticeAt" },
  expired: { type: "kitas_expired", title: "KITAS sudah habis", marker: "kitasExpiredNoticeAt" },
} as const;

export async function notifyKitasExpiry(today = todayDate()): Promise<{ soon: number; expired: number }> {
  const db = await siteDb();
  const result = { soon: 0, expired: 0 };
  // Only active workers inside the window can need a notice
  const workers = await db.foreignWorker.findMany({
    where: { status: "ACTIVE", kitasExpiry: { lte: new Date(today.getTime() + KITAS_ALERT_DAYS * DAY_MS) } },
    select: { id: true, fullName: true, kitasNumber: true, kitasExpiry: true, status: true, kitasSoonNoticeAt: true, kitasExpiredNoticeAt: true },
  });
  if (workers.length === 0) return result;
  const staff = await db.user.findMany({ where: { role: { in: ["ADMIN", "HR"] }, isActive: true }, select: { id: true } });

  for (const w of workers) {
    const due = kitasNoticeDue(w, today);
    if (!due) continue;
    const n = notice[due];
    const sent = await db.$transaction(async (tx) => {
      // Claim the notice first, on the record as it was read: still active, same KITAS
      // date, marker still empty. Another job run (a second server process) or a renewal
      // saved meanwhile makes this match nothing, and then nothing is sent or stamped.
      const claimed = await tx.foreignWorker.updateMany({
        where: { id: w.id, status: "ACTIVE", kitasExpiry: w.kitasExpiry, [n.marker]: null },
        // An expired notice also stands for the "soon" one, so it is never sent afterwards
        data: due === "expired" ? { kitasExpiredNoticeAt: new Date(), kitasSoonNoticeAt: w.kitasSoonNoticeAt ?? new Date() } : { [n.marker]: new Date() },
      });
      if (claimed.count !== 1) return false;
      await tx.notification.createMany({
        data: staff.map((u) => ({
          userId: u.id,
          type: n.type,
          title: n.title,
          // Starts with "<name> · " like the other notifications (retention looks for it)
          body: `${w.fullName} · KITAS ${w.kitasNumber} berlaku sampai ${formatDate(w.kitasExpiry)}.`,
          link: `/dashboard/tka/${w.id}`,
        })),
      });
      return true;
    });
    if (sent) result[due]++;
  }
  return result;
}
