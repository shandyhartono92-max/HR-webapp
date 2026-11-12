import assert from "node:assert/strict";
import * as z from "zod";
import { checkWorkLocation, locationText, parseLocationFilter, parseWorkLocation, warehouseFor, workLocationFields } from "@/lib/work-location";

const Schema = z.object(workLocationFields).superRefine(checkWorkLocation({ required: true }));
const ok = (input: Record<string, unknown>) => Schema.safeParse(input);
const errors = (input: Record<string, unknown>) => {
  const r = Schema.safeParse(input);
  return r.success ? {} : z.flattenError(r.error).fieldErrors;
};

// Not required (an employee who has left): empty is fine, but what is filled must still be valid
const Optional = z.object(workLocationFields).superRefine(checkWorkLocation({ required: false }));
const left = Optional.safeParse({ workLocation: "", warehouse: "" });
assert.equal(left.success, true);
assert.equal(left.data?.workLocation, undefined);
assert.equal(Optional.safeParse({}).success, true);
assert.equal(Optional.safeParse({ workLocation: "GUDANG" }).success, false);
assert.equal(Optional.safeParse({ workLocation: "OPS", warehouse: "" }).success, false, "OPS still needs a warehouse");

// The warehouse limit only applies where a warehouse is kept (OPS)
assert.equal(ok({ workLocation: "HO", warehouse: "x".repeat(150) }).success, true);

// Required, and only HO or OPS
assert.deepEqual(errors({}).workLocation, ["Pilih lokasi kerja: HO atau OPS."]);
assert.deepEqual(errors({ workLocation: "" }).workLocation, ["Pilih lokasi kerja: HO atau OPS."]);
assert.deepEqual(errors({ workLocation: "GUDANG" }).workLocation, ["Pilih lokasi kerja: HO atau OPS."]);

// OPS needs a warehouse; HO does not
assert.deepEqual(errors({ workLocation: "OPS", warehouse: "" }).warehouse, ["Isi nama warehouse untuk lokasi OPS."]);
assert.deepEqual(errors({ workLocation: "OPS", warehouse: "   " }).warehouse, ["Isi nama warehouse untuk lokasi OPS."]);
assert.deepEqual(errors({ workLocation: "OPS" }).warehouse, ["Isi nama warehouse untuk lokasi OPS."]);
assert.equal(ok({ workLocation: "HO" }).success, true);
assert.equal(ok({ workLocation: "HO", warehouse: "" }).success, true);
const ops = ok({ workLocation: "OPS", warehouse: "  Gudang Cikarang  " });
assert.equal(ops.success, true);
assert.equal(ops.data?.warehouse, "Gudang Cikarang", "trimmed");
assert.deepEqual(errors({ workLocation: "OPS", warehouse: "x".repeat(101) }).warehouse, ["Nama warehouse maksimal 100 karakter."]);

// What is stored: HO never keeps a warehouse
assert.equal(warehouseFor("HO", "Gudang Cikarang"), null);
assert.equal(warehouseFor("OPS", " Gudang Cikarang "), "Gudang Cikarang");
assert.equal(warehouseFor(null, "Gudang Cikarang"), null, "no location, no warehouse");
assert.equal(warehouseFor(undefined, "Gudang Cikarang"), null);

// How it reads in the list and profile
assert.equal(locationText("HO", null), "HO");
assert.equal(locationText("HO", "sisa lama"), "HO");
assert.equal(locationText("OPS", "Gudang Cikarang"), "OPS · Gudang Cikarang");
assert.equal(locationText("OPS", null), "OPS");
assert.equal(locationText(null, null), null, "not filled yet");

// Excel cells: code or full name, any case
assert.equal(parseWorkLocation("HO"), "HO");
assert.equal(parseWorkLocation(" ops "), "OPS");
assert.equal(parseWorkLocation("Head Office"), "HO");
assert.equal(parseWorkLocation("operational"), "OPS");
assert.equal(parseWorkLocation("Operasional"), "OPS");
assert.equal(parseWorkLocation("Gudang"), null);
assert.equal(parseWorkLocation(""), null);

// List filter from the URL (?lokasi=ho): anything else means all locations
assert.equal(parseLocationFilter("ho"), "HO");
assert.equal(parseLocationFilter("ops"), "OPS");
assert.equal(parseLocationFilter("OPS"), null, "the URL value is lowercase only");
assert.equal(parseLocationFilter("gudang"), null);
assert.equal(parseLocationFilter(undefined), null);
assert.equal(parseLocationFilter(["ho"]), null);

console.log("check-work-location: ok");
