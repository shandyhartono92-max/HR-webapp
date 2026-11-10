// Shared helpers for server-action forms.
import * as z from "zod";

export type FormState =
  | {
      ok?: boolean;
      message?: string;
      errors?: Record<string, string[] | undefined>;
      // Submitted values, so the form can be refilled after React resets it
      values?: Record<string, string>;
      // Changes on every response; used as the form's key so selects refill too
      attempt?: number;
    }
  | undefined;

export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData) {
    if (typeof value === "string" && !key.startsWith("$")) out[key] = value;
  }
  return out;
}

export function failed(formData: FormData, errors?: Record<string, string[] | undefined>, message?: string): FormState {
  return { errors, message, values: formValues(formData), attempt: Date.now() };
}

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const optionalText = (max = 200) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

export const optionalInt = (min: number, max: number, error: string) =>
  z.preprocess(blankToUndefined, z.coerce.number({ error }).int({ error }).min(min, { error }).max(max, { error }).optional());

export const checkbox = z.preprocess((v) => v === "on", z.boolean());

// <input type="date"> that may be left empty → Date (UTC midnight, for @db.Date) or null
export const optionalDate = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? v : null),
  z
    .string()
    .nullable()
    .transform((v, ctx) => {
      if (v === null) return null;
      const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null;
      if (!d || Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: "custom", message: "Tanggal tidak valid." });
        return z.NEVER;
      }
      return d;
    }),
);
