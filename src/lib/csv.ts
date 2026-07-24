// ── Client-side spreadsheet helpers ──────────────────────────────────────────
// Parse an uploaded CSV *or* Excel (.xlsx) file into the four identity fields
// (header-aware, alias tolerant), and serialize participants back to CSV for
// export. CSV and Excel share the same header→row mapper so behavior is identical.


import type { Participant } from "./types";

export interface Row {
  name: string;
  email: string;
  country: string;
  phone: string;
}

const ALIASES: Record<keyof Row, string[]> = {
  name: ["name", "fullname", "full name", "nombre"],
  email: ["email", "e-mail", "correo", "mail"],
  country: ["country", "pais", "país", "nation"],
  phone: ["phone", "telephone", "tel", "mobile", "cell", "telefono", "teléfono", "whatsapp"],
};

/** Minimal RFC-4180-ish line splitter (handles quoted fields with commas). */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[_\s-]+/g, " ");

/** Maps a 2D cell matrix (row 0 = headers) onto the four identity fields. */
function mapMatrix(matrix: string[][]): Row[] {
  const rows = matrix.filter((r) => r.some((c) => c && c.trim().length > 0));
  if (rows.length < 2) return [];
  const header = rows[0].map(norm);
  const idx = (f: keyof Row) => {
    for (const a of ALIASES[f]) { const i = header.indexOf(a); if (i !== -1) return i; }
    return -1;
  };
  const cols = { name: idx("name"), email: idx("email"), country: idx("country"), phone: idx("phone") };
  const at = (cells: string[], i: number) => (i >= 0 ? (cells[i] ?? "").trim() : "");
  return rows.slice(1).map((cells) => ({
    name: at(cells, cols.name),
    email: at(cells, cols.email),
    country: at(cells, cols.country),
    phone: at(cells, cols.phone),
  })).filter((r) => r.name || r.email);
}

export function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return mapMatrix(lines.map(splitLine));
}

/**
 * Parse an uploaded file into rows. CSV is read as text; Excel (.xlsx) is
 * decoded with `read-excel-file` (dynamically imported so it never bloats the
 * initial bundle) and fed through the same header mapper as CSV.
 */
export async function parseSpreadsheetFile(file: File): Promise<Row[]> {
  const isExcel = /\.xlsx$/i.test(file.name) ||
    file.type.includes("spreadsheetml") || file.type.includes("excel");
  if (!isExcel) return parseCsv(await file.text());

  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const matrix = (await readXlsxFile(file)) as unknown as unknown[][];

  return mapMatrix(matrix.map((r) => r.map((c) => (c == null ? "" : String(c).trim()))));
}



function cell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function participantsToCsv(list: Participant[]): string {
  const header = ["name", "email", "country", "phone", "registered", "registeredAt", "source", "hash"];
  const rows = list.map((p) =>
    [p.name, p.email, p.country, p.phone, p.registered ? "yes" : "no", p.registeredAt ?? "", p.source, p.hash]
      .map(cell)
      .join(",")
  );
  return [header.join(","), ...rows].join("\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
