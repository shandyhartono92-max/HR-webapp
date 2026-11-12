"use client";

import { useState } from "react";
import { Field, inputClass } from "@/app/ui/field";
import { workLocationLabel } from "@/lib/work-location";

// Lokasi (HO / OPS) and, for OPS only, the warehouse. Used by the profile and hire forms;
// the server applies the same rules (lib/work-location.ts).
export function WorkLocationFields({
  idPrefix = "",
  location,
  warehouse,
  errors = {},
  hint,
}: {
  idPrefix?: string;
  location: string;
  warehouse: string;
  errors?: { workLocation?: string[]; warehouse?: string[] };
  hint?: string;
}) {
  const [chosen, setChosen] = useState(location);
  return (
    <>
      <Field label="Lokasi kerja" htmlFor={`${idPrefix}workLocation`} hint={hint} errors={errors.workLocation}>
        <select
          id={`${idPrefix}workLocation`}
          name="workLocation"
          value={chosen}
          onChange={(e) => setChosen(e.target.value)}
          className={inputClass}
        >
          <option value="">Pilih lokasi…</option>
          {Object.entries(workLocationLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {chosen === "OPS" && (
        <Field label="Warehouse" htmlFor={`${idPrefix}warehouse`} hint="Nama gudang tempat karyawan bekerja, misal Gudang Cikarang." errors={errors.warehouse}>
          <input id={`${idPrefix}warehouse`} name="warehouse" maxLength={100} defaultValue={warehouse} className={inputClass} />
        </Field>
      )}
    </>
  );
}
