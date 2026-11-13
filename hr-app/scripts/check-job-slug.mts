import assert from "node:assert/strict";
import { slugify } from "@/lib/job-slug";

assert.equal(slugify("Staf Gudang (Shift Malam)", []), "staf-gudang-shift-malam");
assert.equal(slugify("!!!", []), "lowongan");
// A slug equal to a location code would read as that location's job list at /karir/<code>
assert.equal(slugify("Batam", ["batam", "jakarta"]), "lowongan-batam");
assert.equal(slugify("JAKARTA", ["batam", "jakarta"]), "lowongan-jakarta");
assert.equal(slugify("Batam Center", ["batam", "jakarta"]), "batam-center");

console.log("check-job-slug: ok");
