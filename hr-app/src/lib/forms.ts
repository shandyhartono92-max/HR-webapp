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
