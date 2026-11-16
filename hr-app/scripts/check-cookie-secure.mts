import assert from "node:assert/strict";
import { sessionCookieSecure } from "@/lib/session-token";

// Default: secure in production, not in development (browsers only allow http cookies
// marked secure on localhost)
assert.equal(sessionCookieSecure({ NODE_ENV: "production" }), true);
assert.equal(sessionCookieSecure({ NODE_ENV: "development" }), false);
// A server reached by plain http on an internal IP turns it off explicitly
assert.equal(sessionCookieSecure({ NODE_ENV: "production", SESSION_COOKIE_SECURE: "false" }), false);
assert.equal(sessionCookieSecure({ NODE_ENV: "production", SESSION_COOKIE_SECURE: " FALSE " }), false);
assert.equal(sessionCookieSecure({ NODE_ENV: "development", SESSION_COOKIE_SECURE: "true" }), true);
// Empty or anything unclear keeps the safe default
assert.equal(sessionCookieSecure({ NODE_ENV: "production", SESSION_COOKIE_SECURE: "" }), true);
assert.equal(sessionCookieSecure({ NODE_ENV: "production", SESSION_COOKIE_SECURE: "no" }), true);

console.log("check-cookie-secure: ok");
