import assert from "node:assert/strict";
import { companyConfigured, parseSites, siteByCode, sites, defaultSite, type Site } from "@/lib/sites";
import { companyInfo, dateLine } from "@/lib/letters/service";

const parseSitesOk = (env: Record<string, string | undefined>): Site[] => {
  const r = parseSites(env);
  assert.ok(r.ok);
  return r.sites;
};

const full = {
  SITES: "batam,jakarta",
  SITE_LABEL_BATAM: "Batam",
  SITE_LABEL_JAKARTA: "Jakarta",
  DATABASE_URL_BATAM: "mysql://u:p@h/portal_hr",
  DATABASE_URL_JAKARTA: "mysql://u:p@h/portal_hr_jakarta",
  COMPANY_NAME_BATAM: "PT Batam Jaya",
  COMPANY_ADDRESS_BATAM: "Jl. Batam 1",
  COMPANY_CITY_BATAM: "Batam",
  LETTER_SIGNATORY_NAME_BATAM: "Andi",
  LETTER_SIGNATORY_TITLE_BATAM: "HR Manager",
  COMPANY_NAME_JAKARTA: "PT Jakarta Raya",
  COMPANY_ADDRESS_JAKARTA: "",
  COMPANY_CITY_JAKARTA: "Jakarta",
  LETTER_SIGNATORY_NAME_JAKARTA: "",
  LETTER_SIGNATORY_TITLE_JAKARTA: "",
};

// ── A complete configuration ────────────────────────────────
const ok = parseSites(full);
assert.equal(ok.ok, true, JSON.stringify(ok));
if (ok.ok) {
  assert.deepEqual(ok.sites.map((s) => s.code), ["batam", "jakarta"]);
  assert.deepEqual(ok.sites.map((s) => s.label), ["Batam", "Jakarta"]);
  assert.equal(ok.sites[0].databaseUrl, "mysql://u:p@h/portal_hr");
  assert.deepEqual(ok.sites[0].company, { name: "PT Batam Jaya", address: "Jl. Batam 1", city: "Batam", signatoryName: "Andi", signatoryTitle: "HR Manager" });
  // Blank company values fall back to the placeholders letters showed before
  assert.deepEqual(ok.sites[1].company, {
    name: "PT Jakarta Raya",
    address: "[Alamat perusahaan, kota, kode pos · telepon · email]",
    city: "Jakarta",
    signatoryName: "[Nama Penandatangan]",
    signatoryTitle: "[Jabatan Penandatangan]",
  });
}

// ── Missing values are named ────────────────────────────────
assert.deepEqual(parseSites({ ...full, DATABASE_URL_JAKARTA: "" }), { ok: false, missing: ["DATABASE_URL_JAKARTA"] });
assert.deepEqual(parseSites({ ...full, DATABASE_URL_JAKARTA: undefined }), { ok: false, missing: ["DATABASE_URL_JAKARTA"] });
assert.deepEqual(parseSites({ ...full, SITES: undefined }), { ok: false, missing: ["SITES"] });
assert.deepEqual(parseSites({ ...full, SITES: " , " }), { ok: false, missing: ["SITES"] });

// ── Codes are trimmed and lower-cased; a missing label falls back to the code ──
const loose = parseSites({ ...full, SITES: " Batam , jakarta ", SITE_LABEL_JAKARTA: "" });
assert.ok(loose.ok);
if (loose.ok) {
  assert.deepEqual(loose.sites.map((s) => s.code), ["batam", "jakarta"]);
  assert.equal(loose.sites[1].label, "Jakarta");
}

// ── Reading process.env ─────────────────────────────────────
for (const k of Object.keys(process.env)) if (/^(SITES|SITE_LABEL_|DATABASE_URL_|COMPANY_|LETTER_SIGNATORY_)/.test(k)) delete process.env[k];
Object.assign(process.env, full);
assert.equal(siteByCode("jakarta")?.label, "Jakarta");
assert.equal(siteByCode("medan"), null);
assert.equal(siteByCode(undefined), null);
assert.equal(siteByCode(42), null);
assert.equal(defaultSite().code, "batam");
// ── Letters print the company of the location ─────────────
const jakarta = siteByCode("jakarta")!;
const batam = siteByCode("batam")!;
assert.equal(companyInfo(jakarta).name, "PT Jakarta Raya");
assert.equal(companyInfo(batam).name, "PT Batam Jaya");
assert.equal(dateLine(new Date("2026-11-13T00:00:00Z"), jakarta), "Jakarta, 13 November 2026");
assert.equal(dateLine(new Date("2026-11-13T00:00:00Z"), batam), "Batam, 13 November 2026");
assert.equal(companyConfigured(jakarta), true);
assert.equal(companyConfigured(parseSitesOk({ ...full, COMPANY_NAME_JAKARTA: "" })[1]), false);

delete process.env.DATABASE_URL_BATAM;
assert.throws(() => sites(), /DATABASE_URL_BATAM/);

console.log("check-sites: ok");
