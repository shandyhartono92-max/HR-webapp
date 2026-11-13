import "server-only";
import { siteDb } from "@/lib/db";
import { todayDate } from "@/lib/labels";
import { kitasAlertWhere } from "@/lib/foreign-workers";

// Active foreign workers whose KITAS expires within 30 days or has expired (menu badge)
export const countKitasAlerts = async () => (await siteDb()).foreignWorker.count({ where: kitasAlertWhere(todayDate()) });
