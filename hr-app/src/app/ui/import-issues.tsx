import type { RowIssue } from "@/lib/excel";

// Rows of an uploaded Excel file that need fixing, with the reason per column
export function ImportIssues({ issues }: { issues?: RowIssue[] }) {
  if (!issues?.length) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-red-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-red-50 text-red-800">
          <tr>
            <th className="px-3 py-2 font-medium">Baris</th>
            <th className="px-3 py-2 font-medium">Nama</th>
            <th className="px-3 py-2 font-medium">Yang perlu diperbaiki</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-red-100">
          {issues.map((i) => (
            <tr key={i.rowNumber}>
              <td className="px-3 py-2 tabular-nums text-slate-700">{i.rowNumber}</td>
              <td className="px-3 py-2 text-slate-900">{i.name}</td>
              <td className="px-3 py-2 text-slate-700">
                {i.messages.map((m) => (
                  <p key={m}>{m}</p>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const xlsxInputClass =
  "mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm";
export const XLSX_ACCEPT = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
