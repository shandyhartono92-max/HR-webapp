// AI screening runs after the applicant's response is sent (next/server after()), where
// the careers page's location scope may be gone. screenApplicationIn(site, id) carries
// the location itself. Run outside any scope here, as after() may be.
import assert from "node:assert/strict";
import { screenApplication, screenApplicationIn } from "@/lib/screening";

// Without a location, the plain call cannot even pick a database
await assert.rejects(() => screenApplication("tidak-ada"));

// With it, the call reaches its own checks (here: no API key, or no such application)
const result = await screenApplicationIn("jakarta", "tidak-ada");
assert.equal(result.ok, false);
assert.ok(!/Lokasi/.test(result.ok ? "" : result.error), "the location is known");

console.log("check-screening-site: ok");
process.exit(0);
