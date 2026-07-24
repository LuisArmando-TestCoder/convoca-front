// ── Client-side spreadsheet helpers ──────────────────────────────────────────
// Parse an uploaded CSV *or* Excel (.xlsx) into a header-keyed sheet, then map
// it onto whatever fields the event defines (name + email are always built-in).
// One header→value mapper is shared by CSV and Excel so behavior is identical.

import type { EventField, Participant } from "./types";

export type SheetRow = Record<string, string>;
export interface ParsedSheet {
  /** Normalized header names (lowercased, spaces/underscores collapsed). */
  headers: string[];
  /** Each row keyed by normalized header. */
  rows: SheetRow[];
}

/** Header aliases for the built-ins + common example fields (tolerant matching). */
const ALIASES: Record<string, string[]> = {
  name: ["name", "full name", "fullname", "nombre"],
  email: ["email", "e mail", "correo", "mail"],
  country: ["country", "pais", "país", "nation"],
  phone: ["phone", "telephone", "tel", "mobile", "cell", "telefono", "teléfono", "whatsapp"],
};

const norm = (h: string) => h.trim().toLowerCase().replace(/[_\s-]+/g, " ");

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

/** Build a header-keyed sheet from a 2D cell matrix (row 0 = headers). */
function toSheet(matrix: string[][]): ParsedSheet {
  const rows = matrix.filter((r) => r.some((c) => c && c.trim().length > 0));
  if (rows.length < 2) return { headers: [], rows: [] };
  const headers = rows[0].map(norm);
  const out = rows.slice(1).map((cells) => {
    const rec: SheetRow = {};
    headers.forEach((h, i) => { if (h) rec[h] = (cells[i] ?? "").trim(); });
    return rec;
  });
  return { headers, rows: out };
}

export function parseCsvSheet(text: string): ParsedSheet {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return toSheet(lines.map(splitLine));
}

// ── Excel (.xlsx) — worker-free unzip + light OOXML scan (see fix note) ────────
const decodeXml = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)));

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

async function parseXlsx(file: File): Promise<string[][]> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const buf = new Uint8Array(await file.arrayBuffer());
  const files = unzipSync(buf, {
    filter: (f) => /^xl\/(worksheets\/sheet\d+\.xml|sharedStrings\.xml)$/.test(f.name),
  });

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

export async function parseSpreadsheetFile(file: File): Promise<ParsedSheet> {
  const isExcel = /\.xlsx$/i.test(file.name) ||
    file.type.includes("spreadsheetml") || file.type.includes("excel");
  if (!isExcel) return parseCsvSheet(await file.text());
  return toSheet(await parseXlsx(file));
}

// ── Mapping to participant-import rows ─────────────────────────────────────────

const pick = (rec: SheetRow, candidates: string[]): string => {
  for (const c of candidates) {
    const v = rec[norm(c)];
    if (v) return v;
  }
  return "";
};

/**
 * Turn a parsed sheet into flat import rows: `{ name, email, <fieldKey>: value }`.
 * Fields are matched by their label, key, or a known alias (country/phone/etc).
 */
export function resolveImportRows(sheet: ParsedSheet, fields: EventField[]): SheetRow[] {
  return sheet.rows
    .map((rec) => {
      const row: SheetRow = {
        name: pick(rec, ALIASES.name),
        email: pick(rec, ALIASES.email),
      };
      for (const f of fields) {
        const v = pick(rec, [f.label, f.key, ...(ALIASES[f.key] ?? [])]);
        if (v) row[f.key] = v;
      }
      return row;
    })
    .filter((r) => r.name || r.email);
}

function cell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** A ready-to-fill template with the event's exact columns. */
export function templateCsv(fields: EventField[]): string {
  const header = ["name", "email", ...fields.map((f) => f.label)];
  const sample = ["Jane Doe", "jane@example.com", ...fields.map(() => "")];
  return [header.map(cell).join(","), sample.map(cell).join(",")].join("\n");
}

/** Export participants including their custom-field columns. */
export function participantsToCsv(list: Participant[], fields: EventField[] = []): string {
  const header = ["name", "email", ...fields.map((f) => f.label), "registered", "registeredAt", "source", "hash"];
  const value = (p: Participant, key: string) =>
    p.fields?.[key] ?? (key === "country" ? p.country : key === "phone" ? p.phone : undefined) ?? "";
  const rows = list.map((p) =>
    [
      p.name,
      p.email,
      ...fields.map((f) => value(p, f.key)),
      p.registered ? "yes" : "no",
      p.registeredAt ?? "",
      p.source,
      p.hash,
    ].map(cell).join(",")
  );
  return [header.map(cell).join(","), ...rows].join("\n");
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
