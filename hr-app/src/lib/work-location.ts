import * as z from "zod";
import { WorkLocation } from "@/generated/prisma/enums";

// Where an employee works: HO (Head Office) or OPS (Operational, at a warehouse).
// Shared by the profile form, the hire form and the Excel import so all three
// apply the same rules.

export const workLocationLabel: Record<WorkLocation, string> = {
  HO: "HO (Head Office)",
  OPS: "OPS (Operational)",
};

const REQUIRED = "Pilih lokasi kerja: HO atau OPS.";

// Spread into a z.object(...), then .superRefine(checkWarehouse)
export const workLocationFields = {
  workLocation: z.enum(WorkLocation, { error: REQUIRED }),
  warehouse: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : ""),
    z.string().max(100, { error: "Nama warehouse maksimal 100 karakter." }),
  ),
};

export function checkWarehouse(d: { workLocation?: WorkLocation; warehouse?: string }, ctx: z.RefinementCtx) {
  if (d.workLocation === "OPS" && !d.warehouse) {
    ctx.addIssue({ code: "custom", path: ["warehouse"], message: "Isi nama warehouse untuk lokasi OPS." });
  }
}

// What is stored: a warehouse only for OPS, so moving to HO leaves no stale name behind
export const warehouseFor = (location: WorkLocation, warehouse: string | null | undefined) =>
  location === "OPS" ? warehouse?.trim() || null : null;

// "HO", "OPS · Gudang Cikarang"; null = not filled in yet (employees from before this field)
export function locationText(location: WorkLocation | null, warehouse: string | null): string | null {
  if (!location) return null;
  return location === "OPS" && warehouse ? `OPS · ${warehouse}` : location;
}

// The employee list's filter (?lokasi=ho / ?lokasi=ops); anything else = all locations
export function parseLocationFilter(value: unknown): WorkLocation | null {
  return value === "ho" ? "HO" : value === "ops" ? "OPS" : null;
}

const aliases: Record<string, WorkLocation> = {
  ho: "HO",
  "head office": "HO",
  ops: "OPS",
  operational: "OPS",
  operasional: "OPS",
};

// An Excel cell: the code or the full name, any case
export const parseWorkLocation = (text: string): WorkLocation | null => aliases[text.trim().toLowerCase()] ?? null;
