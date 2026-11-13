import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { readSession, signSession } from "@/lib/session-token";
import { scopedSite, withSite } from "@/lib/site-context";
import { dbFor } from "@/lib/db";

const key = new TextEncoder().encode(process.env.SESSION_SECRET);
const legacy = (payload: Record<string, unknown>) =>
  new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(key);

// ── The session carries the location ────────────────────────
const token = await signSession({ userId: "u1", role: "HR", site: "batam" });
assert.deepEqual(await readSession(token), { userId: "u1", role: "HR", site: "batam" });

// old session without site is rejected (cookies from before locations existed)
assert.equal(await readSession(await legacy({ userId: "u1", role: "HR" })), null);
// a location that is not configured
assert.equal(await readSession(await legacy({ userId: "u1", role: "HR", site: "medan" })), null);

// ── An explicit location scope (jobs, careers page, scripts) ──
assert.equal(scopedSite(), undefined);
assert.equal(await withSite("jakarta", async () => scopedSite()), "jakarta");
assert.deepEqual(
  await withSite("jakarta", async () => [scopedSite(), await withSite("batam", async () => scopedSite()), scopedSite()]),
  ["jakarta", "batam", "jakarta"],
);
await assert.rejects(() => withSite("medan", async () => 1), /medan/);

// ── One client per location ─────────────────────────────────
assert.equal(dbFor("batam"), dbFor("batam"));
assert.notEqual(dbFor("batam"), dbFor("jakarta"));
assert.throws(() => dbFor("medan"), /medan/);

await Promise.all([dbFor("batam").$disconnect(), dbFor("jakarta").$disconnect()]);
console.log("check-site-session: ok");
