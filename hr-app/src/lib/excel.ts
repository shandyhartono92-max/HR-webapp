import "server-only";
import ExcelJS from "exceljs";

// Shared pieces of the Excel imports (candidates, employees): template styling,
// dropdown lists and reading rows back by header text.

// aliases: earlier header texts still accepted when reading an uploaded sheet
export type Column<K extends string> = { key: K; header: string; width: number; aliases?: readonly string[] };

export function newTemplate<K extends string>(sheetName: string, columns: readonly Column<K>[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Portal HR";
  const sheet = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
  // Dropdown values live on a hidden sheet, so labels may contain commas
  const lists = wb.addWorksheet("Daftar", { state: "veryHidden" });
  return { wb, sheet, lists };
}

// Writes `values` into column `col` of the hidden list sheet and returns the range for a dropdown
export function addList(lists: ExcelJS.Worksheet, col: number, values: readonly string[]) {
  values.forEach((v, i) => (lists.getCell(i + 1, col).value = v));
  const letter = String.fromCharCode(64 + col);
  return `Daftar!$${letter}$1:$${letter}$${values.length}`;
}

export function dropdown(range: string, error: string): ExcelJS.DataValidation {
  return { type: "list", allowBlank: true, formulae: [range], showErrorMessage: true, errorTitle: "Isian tidak valid", error };
}

export function addHelpSheet(wb: ExcelJS.Workbook, lines: string[]) {
  const help = wb.addWorksheet("Petunjuk");
  help.getColumn(1).width = 110;
  lines.forEach((text, i) => (help.getCell(i + 1, 1).value = text));
  help.getRow(1).font = { bold: true, size: 13 };
}

// Plain text of a cell, whatever Excel stored (number, date, hyperlink, rich text, formula)
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((p) => p.text).join("").trim();
    if ("text" in value) return cellText(value.text as ExcelJS.CellValue);
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    return "";
  }
  return String(value).trim();
}

export type SheetRows<K extends string> =
  | { ok: true; rows: { rowNumber: number; raw: Record<K, string> }[] }
  | { ok: false; message: string };

// Reads the non-empty rows of `sheetName` (or the first sheet), finding columns by header text
export async function readSheet<K extends string>(
  data: Buffer,
  sheetName: string,
  columns: readonly Column<K>[],
  maxRows: number,
): Promise<SheetRows<K>> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as unknown as ArrayBuffer);
  } catch {
    return { ok: false, message: "File tidak bisa dibaca. Gunakan template Excel (.xlsx) dari halaman ini." };
  }
  const sheet = wb.getWorksheet(sheetName) ?? wb.worksheets[0];
  if (!sheet) return { ok: false, message: "File tidak berisi sheet." };

  // By header text, so a moved column still works
  const index = new Map<K, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    const text = cellText(cell.value).toLowerCase();
    const match = columns.find((c) => [c.header, ...(c.aliases ?? [])].some((h) => h.toLowerCase() === text));
    if (match) index.set(match.key, col);
  });
  const missing = columns.filter((c) => !index.has(c.key)).map((c) => `"${c.header}"`);
  if (missing.length) return { ok: false, message: `Kolom tidak ditemukan: ${missing.join(", ")}. Gunakan template dari halaman ini.` };

  const rows: { rowNumber: number; raw: Record<K, string> }[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const raw = Object.fromEntries(columns.map((c) => [c.key, cellText(row.getCell(index.get(c.key)!).value)])) as Record<K, string>;
    if (Object.values(raw).every((v) => v === "")) continue;
    if (rows.length >= maxRows) return { ok: false, message: `Maksimal ${maxRows} baris per file. Bagi menjadi beberapa file.` };
    rows.push({ rowNumber: r, raw });
  }
  if (rows.length === 0) return { ok: false, message: "Tidak ada data di file." };
  return { ok: true, rows };
}

// Turns zod issues into "Kolom: pesan" lines using the template headers
export function issueMessages<K extends string>(
  columns: readonly Column<K>[],
  issues: { path: PropertyKey[]; message: string }[],
): string[] {
  return issues.map((i) => {
    const col = columns.find((c) => c.key === i.path[0]);
    return `${col ? col.header.replace(" *", "") : "Baris"}: ${i.message}`;
  });
}

export type RowIssue = { rowNumber: number; name: string; messages: string[] };

// useActionState state of the import forms
export type ImportState = { message?: string; issues?: RowIssue[]; attempt?: number } | undefined;
