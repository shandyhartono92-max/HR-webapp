import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Field-level encryption for NIK, NPWP, BPJS, bank account numbers and salary.
// Stored format: v1.<iv>.<authTag>.<ciphertext>, each part base64url.

const ALGORITHM = "aes-256-gcm";

function getKey() {
  const key = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return key;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decrypt(payload: string): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unknown ciphertext format");
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function lastFour(value: string): string {
  return value.replace(/\D/g, "").slice(-4);
}

export function masked(last4: string | null | undefined): string {
  return last4 ? `••••${last4}` : "-";
}
