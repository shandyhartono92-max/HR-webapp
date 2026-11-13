// The locations Portal HR serves (Batam, Jakarta, …). Each has its own database
// with the same schema and its own company identity for letters. All of it is
// configured in .env:
//   SITES="batam,jakarta"
//   SITE_LABEL_<CODE>, DATABASE_URL_<CODE>, COMPANY_NAME_<CODE>, COMPANY_ADDRESS_<CODE>,
//   COMPANY_CITY_<CODE>, LETTER_SIGNATORY_NAME_<CODE>, LETTER_SIGNATORY_TITLE_<CODE>
// Pure apart from sites() reading process.env; checked by scripts/check-sites.mts.

export type SiteCode = string;

export type Site = {
  code: SiteCode;
  label: string;
  databaseUrl: string;
  company: { name: string; address: string; city: string; signatoryName: string; signatoryTitle: string };
};

type Env = Record<string, string | undefined>;

// Shown on letters until the company details are filled in (as before locations)
const PLACEHOLDER = {
  name: "[Nama Perusahaan]",
  address: "[Alamat perusahaan, kota, kode pos · telepon · email]",
  city: "[Kota]",
  signatoryName: "[Nama Penandatangan]",
  signatoryTitle: "[Jabatan Penandatangan]",
};

export function parseSites(env: Env): { ok: true; sites: Site[] } | { ok: false; missing: string[] } {
  const codes = (env.SITES ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  if (codes.length === 0) return { ok: false, missing: ["SITES"] };

  const missing: string[] = [];
  const sites = codes.map((code): Site => {
    const key = code.toUpperCase();
    const get = (name: string) => env[`${name}_${key}`]?.trim() ?? "";
    const databaseUrl = get("DATABASE_URL");
    if (!databaseUrl) missing.push(`DATABASE_URL_${key}`);
    return {
      code,
      label: get("SITE_LABEL") || code.charAt(0).toUpperCase() + code.slice(1),
      databaseUrl,
      company: {
        name: get("COMPANY_NAME") || PLACEHOLDER.name,
        address: get("COMPANY_ADDRESS") || PLACEHOLDER.address,
        city: get("COMPANY_CITY") || PLACEHOLDER.city,
        signatoryName: get("LETTER_SIGNATORY_NAME") || PLACEHOLDER.signatoryName,
        signatoryTitle: get("LETTER_SIGNATORY_TITLE") || PLACEHOLDER.signatoryTitle,
      },
    };
  });
  return missing.length ? { ok: false, missing } : { ok: true, sites };
}

// The configured locations; a gap in .env stops the app with the variable's name
export function sites(): Site[] {
  const parsed = parseSites(process.env);
  if (!parsed.ok) throw new Error(`Konfigurasi lokasi belum lengkap di .env: ${parsed.missing.join(", ")}`);
  return parsed.sites;
}

export function siteByCode(code: unknown): Site | null {
  if (typeof code !== "string") return null;
  return sites().find((s) => s.code === code) ?? null;
}

// The first location in SITES (used where nothing else names one)
export const defaultSite = (): Site => sites()[0];

// The placeholder company name means the details were never filled in
export const companyConfigured = (site: Site) => site.company.name !== PLACEHOLDER.name;
