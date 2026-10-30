// Bump the version whenever the privacy notice text in /karir/privasi changes.
// Each Candidate stores the version they agreed to.
export const PRIVACY_NOTICE_VERSION = "2026-10.2"; // .2: AI provider and cross-border transfer

export const RETENTION_MONTHS = 6;
export const TALENT_POOL_RETENTION_MONTHS = 24;

export const MAX_CV_BYTES = 5 * 1024 * 1024;

export function retainUntil(talentPool: boolean, from = new Date()) {
  const d = new Date(from);
  d.setMonth(d.getMonth() + (talentPool ? TALENT_POOL_RETENTION_MONTHS : RETENTION_MONTHS));
  return d;
}
