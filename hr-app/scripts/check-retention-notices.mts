// Retention removes HR notifications that name an anonymised candidate or employee
// ("<name> · …"). A foreign worker with the same name keeps their KITAS notifications.
import assert from "node:assert/strict";
import { notificationsNaming } from "@/lib/retention";

const where = notificationsNaming("Budi Santoso");
assert.deepEqual(where.body, { startsWith: "Budi Santoso · " });
assert.deepEqual(where.NOT, { link: { startsWith: "/dashboard/tka/" } });

console.log("check-retention-notices: ok");
process.exit(0);
