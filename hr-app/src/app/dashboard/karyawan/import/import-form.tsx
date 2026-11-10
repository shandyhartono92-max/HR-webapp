"use client";

import { useActionState } from "react";
import { importEmployees } from "@/app/actions/employees";
import { Field, FormMessage, useHydrated } from "@/app/ui/field";
import { ImportIssues, XLSX_ACCEPT, xlsxInputClass } from "@/app/ui/import-issues";

export function ImportEmployeesForm() {
  const [state, action, pending] = useActionState(importEmployees, undefined);
  const hydrated = useHydrated();

  return (
    <form key={state?.attempt} action={action} className="space-y-4">
      <FormMessage message={state?.message} />
      <ImportIssues issues={state?.issues} />
      <Field label="File Excel" htmlFor="importFile" hint="Template yang sudah diisi (.xlsx), maksimal 2 MB.">
        <input id="importFile" name="file" type="file" required accept={XLSX_ACCEPT} className={xlsxInputClass} />
      </Field>
      <button
        type="submit"
        disabled={pending || !hydrated}
        className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {pending ? "Mengimpor…" : "Import karyawan"}
      </button>
    </form>
  );
}
