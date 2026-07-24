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

const decodeXml = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)));

/** 0-based column index from a cell ref like "AB12". */
function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const innerText = (xml: string) =>
  (xml.match(/<t[^>]*>[\s\S]*?<\/t>/g) ?? [])
    .map((t) => t.replace(/^<t[^>]*>/, "").replace(/<\/t>$/, ""))
    .join("");

/**
 * Minimal `.xlsx` → cell-matrix reader for the first worksheet. Unzips with
 * fflate's SYNCHRONOUS `unzipSync` (no web workers — which is what made the
 * previous library fail when bundled) and does a light OOXML scan. Good enough
 * for the four string columns we need; numeric cells come through as text.
 */
async function parseXlsx(file: File): Promise<string[][]> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const buf = new Uint8Array(await file.arrayBuffer());
  const files = unzipSync(buf, {
    filter: (f) => /^xl\/(worksheets\/sheet\d+\.xml|sharedStrings\.xml)$/.test(f.name),
  });

  // Shared-strings table: each <si> may hold several <t> runs (rich text).
  const shared: string[] = [];
  if (files["xl/sharedStrings.xml"]) {
    const xml = strFromU8(files["xl/sharedStrings.xml"]);
    for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) shared.push(decodeXml(innerText(si)));
  }

  const sheetName = Object.keys(files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))[0];
  if (!sheetName) return [];
  const sheetXml = strFromU8(files[sheetName]);

  const rows: string[][] = [];
  for (const rowXml of sheetXml.match(/<row[\s\S]*?<\/row>/g) ?? []) {
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rowXml))) {
      const attrs = cm[1];
      const inner = cm[2] ?? "";
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const col = ref ? colIndex(ref) : cells.length;
      let val = "";
      if (type === "s") {
        const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (v) val = shared[Number(v)] ?? "";
      } else if (type === "inlineStr") {
        val = decodeXml(innerText(inner));
      } else {
        const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        val = v ? decodeXml(v) : "";
      }
      cells[col] = val;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] == null) cells[i] = "";
    rows.push(cells);
  }
  return rows;
}

/**
 * Parse an uploaded file into rows. CSV is read as text; Excel (.xlsx) is
 * unzipped + scanned in-browser and fed through the same header mapper as CSV,
 * so behavior is identical across formats.
 */
export async function parseSpreadsheetFile(file: File): Promise<Row[]> {
  const isExcel = /\.xlsx$/i.test(file.name) ||
    file.type.includes("spreadsheetml") || file.type.includes("excel");
  if (!isExcel) return parseCsv(await file.text());
  return mapMatrix(await parseXlsx(file));
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
