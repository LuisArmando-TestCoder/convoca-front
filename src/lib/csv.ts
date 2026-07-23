// ── Client-side CSV helpers ──────────────────────────────────────────────────
// Parse an uploaded CSV into the four identity fields (header-aware, alias
// tolerant), and serialize participants back to CSV for export.

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

export function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = splitLine(lines[0]).map(norm);
  const idx = (f: keyof Row) => {
    for (const a of ALIASES[f]) { const i = header.indexOf(a); if (i !== -1) return i; }
    return -1;
  };
  const cols = { name: idx("name"), email: idx("email"), country: idx("country"), phone: idx("phone") };
  const at = (cells: string[], i: number) => (i >= 0 ? (cells[i] ?? "") : "");
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    return {
      name: at(cells, cols.name),
      email: at(cells, cols.email),
      country: at(cells, cols.country),
      phone: at(cells, cols.phone),
    };
  }).filter((r) => r.name || r.email);
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
