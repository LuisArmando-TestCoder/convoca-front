"use client";

import { useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import {
  downloadCsv,
  parseSpreadsheetFile,
  participantsToCsv,
  resolveImportRows,
  type SheetRow,
  templateCsv,
} from "@/lib/csv";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import QrModal from "@/components/QrModal";
import SendProgress, { type SendItem, type SendState } from "@/components/SendProgress";
import { type StreamMsg, useEventStream } from "@/lib/eventStream";
import type { EventField, Participant } from "@/lib/types";

interface Props {
  eventId: string;
  fields: EventField[];
  participants: Participant[];
  onChange: () => void;
}

type BulkResult = { ok: number; failed: number; errors: string[] };
interface PForm {
  name: string;
  email: string;
  fields: Record<string, string>;
}
const blankForm = (): PForm => ({ name: "", email: "", fields: {} });

type QrFilter = "any" | "sent" | "unsent";
type CheckFilter = "any" | "in" | "pending";
type SourceFilter = "any" | "manual" | "csv" | "self";

/** Reads a participant's value for a field key (custom map, or legacy column). */
function pv(p: Participant, key: string): string {
  return p.fields?.[key] ?? (key === "country" ? p.country : key === "phone" ? p.phone : undefined) ?? "";
}

/** Upserts a live-send item by hash (replace if present, else append). */
function upsertItem(items: SendItem[], next: SendItem): SendItem[] {
  const i = items.findIndex((x) => x.hash === next.hash);
  if (i === -1) return [...items, next];
  const copy = items.slice();
  copy[i] = next;
  return copy;
}

export default function ParticipantsPanel({ eventId, fields, participants, onChange }: Props) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<PForm>(blankForm());
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Participant | null>(null);
  const [editForm, setEditForm] = useState<PForm>(blankForm());
  const [savingEdit, setSavingEdit] = useState(false);
  const [qrFor, setQrFor] = useState<Participant | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<SheetRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<null | "delete">(null);
  const [starting, setStarting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false);
  const [qrFilter, setQrFilter] = useState<QrFilter>("any");
  const [checkFilter, setCheckFilter] = useState<CheckFilter>("any");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("any");
  const [fieldFilters, setFieldFilters] = useState<Record<string, string>>({});

  const activeFilters =
    (qrFilter !== "any" ? 1 : 0) +
    (checkFilter !== "any" ? 1 : 0) +
    (sourceFilter !== "any" ? 1 : 0) +
    Object.values(fieldFilters).filter((v) => v.trim()).length;

  function resetFilters() {
    setQrFilter("any");
    setCheckFilter("any");
    setSourceFilter("any");
    setFieldFilters({});
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return participants.filter((p) => {
      if (
        q &&
        ![p.name, p.email, ...fields.map((f) => pv(p, f.key))].some((v) => v.toLowerCase().includes(q))
      ) return false;
      if (qrFilter === "sent" && !p.qrSentAt) return false;
      if (qrFilter === "unsent" && p.qrSentAt) return false;
      if (checkFilter === "in" && !p.registered) return false;
      if (checkFilter === "pending" && p.registered) return false;
      if (sourceFilter !== "any" && p.source !== sourceFilter) return false;
      for (const [key, val] of Object.entries(fieldFilters)) {
        const needle = val.trim().toLowerCase();
        if (needle && !pv(p, key).toLowerCase().includes(needle)) return false;
      }
      return true;
    });
  }, [participants, query, fields, qrFilter, checkFilter, sourceFilter, fieldFilters]);

  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.hash));
  const selectedList = useMemo(() => participants.filter((p) => selected.has(p.hash)), [participants, selected]);

  // ── Live send (socket-driven) ───────────────────────────────────────────────
  const [send, setSend] = useState<SendState | null>(null);

  useEventStream(eventId, (m: StreamMsg) => {
    if (m.t === "start") {
      setSend({ total: m.total, by: m.by, items: [], done: false, sent: 0, failed: 0, reportedTo: null });
    } else if (m.t === "item") {
      setSend((s) => {
        if (!s) return s;
        const items = upsertItem(s.items, {
          hash: m.hash,
          name: m.name,
          email: m.email,
          status: m.status,
          reason: m.reason,
        });
        return {
          ...s,
          items,
          sent: items.filter((x) => x.status === "sent").length,
          failed: items.filter((x) => x.status === "failed").length,
        };
      });
    } else if (m.t === "done") {
      setSend((s) => (s ? { ...s, done: true, sent: m.sent, failed: m.failed, reportedTo: m.reportedTo } : s));
      onChange();
    }
  });

  const setName = (v: string) => setForm((f) => ({ ...f, name: v }));
  const setEmail = (v: string) => setForm((f) => ({ ...f, email: v }));
  const setFieldVal = (key: string, v: string) =>
    setForm((f) => ({ ...f, fields: { ...f.fields, [key]: v } }));
  const setEName = (v: string) => setEditForm((f) => ({ ...f, name: v }));
  const setEEmail = (v: string) => setEditForm((f) => ({ ...f, email: v }));
  const setEFieldVal = (key: string, v: string) =>
    setEditForm((f) => ({ ...f, fields: { ...f.fields, [key]: v } }));

  function toggleOne(hash: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(hash) ? next.delete(hash) : next.add(hash);
      return next;
    });
  }
  function toggleAll() {
    setSelected((s) => {
      const next = new Set(s);
      if (filtered.every((p) => next.has(p.hash))) filtered.forEach((p) => next.delete(p.hash));
      else filtered.forEach((p) => next.add(p.hash));
      return next;
    });
  }
  const selectAllMatching = () => setSelected(new Set(filtered.map((p) => p.hash)));
  const clearSelection = () => setSelected(new Set());

  async function addOne(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ created: boolean; emailed: boolean }>(`/api/events/${eventId}/participants`, {
        method: "POST",
        body: { name: form.name, email: form.email, fields: form.fields },
      });
      toast.push(res.created ? (res.emailed ? "Added — QR emailed." : "Added (email failed).") : "Already registered.", res.created ? "ok" : "info");
      setForm(blankForm());
      setShowAdd(false);
      onChange();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Add failed.", "err");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(p: Participant) {
    const f: Record<string, string> = {};
    for (const fld of fields) f[fld.key] = pv(p, fld.key);
    setEditForm({ name: p.name, email: p.email, fields: f });
    setEditing(p);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSavingEdit(true);
    try {
      await api(`/api/events/${eventId}/participants/${editing.hash}`, {
        method: "PATCH",
        body: { name: editForm.name, email: editForm.email, fields: editForm.fields },
      });
      toast.push("Participant updated.", "ok");
      setEditing(null);
      onChange();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Update failed.", "err");
    } finally {
      setSavingEdit(false);
    }
  }

  // ── Import (instructions → drag & drop → preview) ───────────────────────────
  function openImport() {
    setImportRows(null);
    setShowImport(true);
  }
  function closeImport() {
    setShowImport(false);
    setImportRows(null);
    if (fileRef.current) fileRef.current.value = "";
  }
  async function readFile(file: File) {
    try {
      const sheet = await parseSpreadsheetFile(file);
      const rows = resolveImportRows(sheet, fields);
      if (rows.length === 0) {
        toast.push("No rows found. Include at least name and email columns.", "err");
        return;
      }
      setImportRows(rows);
    } catch {
      toast.push("Couldn't read that file. Use a .csv or .xlsx export.", "err");
    }
  }
  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  }

  async function commitImport() {
    if (!importRows) return;
    setImporting(true);
    try {
      const res = await api<{ created: number; skipped: number; errors: string[] }>(
        `/api/events/${eventId}/participants/csv`,
        { method: "POST", body: { rows: importRows } },
      );
      toast.push(`Imported ${res.created} (pending) · skipped ${res.skipped}. Send QRs when ready.`, "ok");
      if (res.errors.length) toast.push(`${res.errors.length} row error(s).`, "err");
      closeImport();
      onChange();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Import failed.", "err");
    } finally {
      setImporting(false);
    }
  }

  async function sendQr(p: Participant) {
    try {
      await api(`/api/events/${eventId}/participants/${p.hash}/resend`, { method: "POST", body: {} });
      toast.push(`QR ${p.qrSentAt ? "re-sent" : "sent"} to ${p.email}.`, "ok");
      onChange();
    } catch {
      toast.push("Send failed.", "err");
    }
  }

  async function remove(p: Participant) {
    if (!confirm(`Remove ${p.name}?`)) return;
    try {
      await api(`/api/events/${eventId}/participants/${p.hash}`, { method: "DELETE" });
      toast.push("Removed.", "ok");
      onChange();
    } catch {
      toast.push("Delete failed.", "err");
    }
  }

  // Live, sequential send to every selected participant. Progress streams in via
  // the WebSocket (see SendProgress); this just kicks it off.
  async function sendSelected() {
    const hashes = selectedList.map((p) => p.hash);
    if (hashes.length === 0) return;
    setStarting(true);
    try {
      const res = await api<{ total: number; sent: number; failed: number; reportedTo: string | null }>(
        `/api/events/${eventId}/participants/send`,
        { method: "POST", body: { hashes } },
      );
      clearSelection();
      toast.push(`${res.sent} sent${res.failed ? ` · ${res.failed} failed` : ""}.`, res.failed ? "info" : "ok");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Send failed to start.", "err");
    } finally {
      setStarting(false);
    }
  }

  async function runBulkDelete() {
    const hashes = selectedList.map((p) => p.hash);
    if (hashes.length === 0) return;
    if (!confirm(`Delete ${hashes.length} selected participant(s)?`)) return;
    setBulkBusy("delete");
    try {
      const res = await api<BulkResult>(`/api/events/${eventId}/participants/bulk`, {
        method: "POST",
        body: { action: "delete", hashes },
      });
      toast.push(`${res.ok} deleted${res.failed ? ` · ${res.failed} failed` : ""}.`, res.failed ? "info" : "ok");
      clearSelection();
      onChange();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Delete failed.", "err");
    } finally {
      setBulkBusy(null);
    }
  }

  const fieldInputs = (values: Record<string, string>, onSet: (key: string, v: string) => void) =>
    fields.length > 0 && (
      <div className="row gap-12 wrap">
        {fields.map((f) => (
          <div className="field grow" style={{ minWidth: 160 }} key={f.key}>
            <label>{f.label}{f.required ? " *" : ""}</label>
            <input
              className="input"
              value={values[f.key] ?? ""}
              onChange={(e) => onSet(f.key, e.target.value)}
              required={f.required}
            />
          </div>
        ))}
      </div>
    );

  return (
    <div>
      <div className="row wrap gap-8" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <input
          className="input"
          style={{ maxWidth: 260 }}
          placeholder="Search participants…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="row gap-8 wrap">
          <button
            className={`btn btn--ghost btn--sm ${showFilters || activeFilters ? "btn--on" : ""}`}
            onClick={() => setShowFilters((v) => !v)}
          >
            ⚙ Filters{activeFilters ? ` · ${activeFilters}` : ""}
          </button>
          <button className="btn btn--ghost btn--sm" onClick={openImport}>Import</button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => downloadCsv("participants.csv", participantsToCsv(participants, fields))}
            disabled={participants.length === 0}
          >
            Export CSV
          </button>
          <button className="btn btn--primary btn--sm" onClick={() => setShowAdd(true)}>+ Add participant</button>
        </div>
      </div>

      {showFilters && (
        <div className="filterbar">
          <div className="filterbar__group">
            <label className="filterbar__label">QR</label>
            <select className="select" value={qrFilter} onChange={(e) => setQrFilter(e.target.value as QrFilter)}>
              <option value="any">Any</option>
              <option value="sent">Sent</option>
              <option value="unsent">Not sent</option>
            </select>
          </div>
          <div className="filterbar__group">
            <label className="filterbar__label">Check-in</label>
            <select className="select" value={checkFilter} onChange={(e) => setCheckFilter(e.target.value as CheckFilter)}>
              <option value="any">Any</option>
              <option value="in">Checked in</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <div className="filterbar__group">
            <label className="filterbar__label">Source</label>
            <select className="select" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}>
              <option value="any">Any</option>
              <option value="manual">Manual</option>
              <option value="csv">Imported</option>
              <option value="self">Self-registered</option>
            </select>
          </div>
          {fields.map((f) => (
            <div className="filterbar__group" key={f.key}>
              <label className="filterbar__label">{f.label}</label>
              <input
                className="input"
                style={{ maxWidth: 160 }}
                placeholder={`Any ${f.label.toLowerCase()}`}
                value={fieldFilters[f.key] ?? ""}
                onChange={(e) => setFieldFilters((s) => ({ ...s, [f.key]: e.target.value }))}
              />
            </div>
          ))}
          {activeFilters > 0 && (
            <button className="btn btn--ghost btn--sm" onClick={resetFilters}>Reset</button>
          )}
        </div>
      )}

      {participants.length > 0 && (
        <div className="row wrap gap-8 selecthint">
          <span className="small muted">
            <strong>{filtered.length}</strong> match{activeFilters || query ? " current filters" : ""}
            {selected.size ? ` · ${selected.size} selected` : ""}
          </span>
          <div className="grow" />
          <button className="btn btn--ghost btn--sm" onClick={selectAllMatching} disabled={filtered.length === 0}>
            Select all {filtered.length} matching
          </button>
          {selected.size > 0 && <button className="btn btn--ghost btn--sm" onClick={clearSelection}>Clear</button>}
        </div>
      )}

      {selected.size > 0 && (
        <div className="bulkbar">
          <strong className="small">{selected.size} selected</strong>
          <div className="grow" />
          <button className="btn btn--primary btn--sm" onClick={sendSelected} disabled={starting || bulkBusy !== null}>
            {starting ? <span className="spinner" /> : `Send QR to ${selected.size}`}
          </button>
          <button className="btn btn--danger btn--sm" onClick={runBulkDelete} disabled={bulkBusy !== null || starting}>
            {bulkBusy === "delete" ? <span className="spinner" /> : "Delete"}
          </button>
          <button className="btn btn--ghost btn--sm" onClick={clearSelection} disabled={bulkBusy !== null}>Clear</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card center" style={{ padding: 40 }}>
          <p className="muted">{participants.length === 0 ? "No participants yet. Add one or import a file." : "No matches."}</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    className="check"
                    aria-label="Select all"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = selected.size > 0 && !allSelected; }}
                    onChange={toggleAll}
                  />
                </th>
                <th>Name</th>
                <th>Email</th>
                {fields.map((f) => <th key={f.key}>{f.label}</th>)}
                <th>Status</th>
                <th>QR</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.hash} className={selected.has(p.hash) ? "row--selected" : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      className="check"
                      aria-label={`Select ${p.name}`}
                      checked={selected.has(p.hash)}
                      onChange={() => toggleOne(p.hash)}
                    />
                  </td>
                  <td>{p.name}</td>
                  <td className="muted">{p.email}</td>
                  {fields.map((f) => <td key={f.key}>{pv(p, f.key)}</td>)}
                  <td>
                    {p.registered
                      ? <span className="badge badge--ok">✓ Checked in</span>
                      : <span className="badge badge--pending">Pending</span>}
                  </td>
                  <td>
                    {p.qrSentAt
                      ? <span className="badge badge--info">Sent</span>
                      : <span className="badge badge--pending">Not sent</span>}
                  </td>
                  <td className="actions">
                    <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
                      <button className="btn btn--ghost btn--sm" onClick={() => setQrFor(p)}>QR</button>
                      <button className="btn btn--primary btn--sm" onClick={() => sendQr(p)}>{p.qrSentAt ? "Resend" : "Send QR"}</button>
                      <button className="btn btn--ghost btn--sm" onClick={() => openEdit(p)}>Edit</button>
                      <button className="btn btn--danger btn--sm" onClick={() => remove(p)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <Modal title="Add participant" onClose={() => setShowAdd(false)}>
          <form onSubmit={addOne}>
            <div className="field"><label>Name *</label><input className="input" value={form.name} onChange={(e) => setName(e.target.value)} required /></div>
            <div className="field"><label>Email *</label><input className="input" type="email" value={form.email} onChange={(e) => setEmail(e.target.value)} required /></div>
            {fieldInputs(form.fields, setFieldVal)}
            <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn--ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn--primary" disabled={busy}>{busy ? <span className="spinner" /> : "Add & email QR"}</button>
            </div>
          </form>
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <form onSubmit={saveEdit}>
            <div className="field"><label>Name *</label><input className="input" value={editForm.name} onChange={(e) => setEName(e.target.value)} required /></div>
            <div className="field"><label>Email *</label><input className="input" type="email" value={editForm.email} onChange={(e) => setEEmail(e.target.value)} required /></div>
            {fieldInputs(editForm.fields, setEFieldVal)}
            <p className="hint" style={{ marginTop: 4 }}>Changing name or email changes the QR — send it again after saving.</p>
            <div className="row gap-8 mt-8" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn--primary" disabled={savingEdit}>{savingEdit ? <span className="spinner" /> : "Save changes"}</button>
            </div>
          </form>
        </Modal>
      )}

      {showImport && (
        <Modal
          title="Import participants"
          onClose={closeImport}
          footer={importRows ? (
            <>
              <button className="btn btn--ghost" onClick={() => setImportRows(null)}>Choose another file</button>
              <button className="btn btn--primary" onClick={commitImport} disabled={importing || importRows.length === 0}>
                {importing ? <span className="spinner" /> : `Import ${importRows.length}`}
              </button>
            </>
          ) : (
            <button className="btn btn--ghost" onClick={closeImport}>Cancel</button>
          )}
        >
          {!importRows ? (
            <>
              <div className="spec">
                <strong className="small">Your CSV or Excel (.xlsx) file needs a header row with these columns:</strong>
                <ul className="spec-list">
                  <li><code>name</code> — the participant&apos;s full name</li>
                  <li><code>email</code> — where their QR ticket is sent</li>
                  {fields.map((f) => (
                    <li key={f.key}><code>{f.label}</code>{f.required ? " (required)" : ""}</li>
                  ))}
                </ul>
                <p className="hint" style={{ marginTop: 10 }}>
                  Column order doesn&apos;t matter and common aliases work. Duplicates are skipped.
                  Imported people are added <strong>pending</strong> — no email is sent until you send it.
                </p>
                <button className="btn btn--ghost btn--sm mt-8" onClick={() => downloadCsv("participants-template.csv", templateCsv(fields))}>
                  ⬇ Download template
                </button>
              </div>

              <div
                className={`dropzone ${dragOver ? "dropzone--over" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                <div className="dropzone__icon">📄</div>
                <strong>Drag &amp; drop your CSV or Excel file</strong>
                <span className="dropzone__hint">or click to browse — .csv or .xlsx</span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                onChange={onInputChange}
              />
            </>
          ) : (
            <>
              <p className="muted">
                Found <strong>{importRows.length}</strong> row(s). Duplicates are skipped; imported people are
                added <strong>pending</strong> — send their QR when ready.
              </p>
              <div style={{ maxHeight: 240, overflowY: "auto", marginTop: 12 }}>
                <table className="table">
                  <thead>
                    <tr><th>Name</th><th>Email</th>{fields.map((f) => <th key={f.key}>{f.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 50).map((r, i) => (
                      <tr key={i}>
                        <td>{r.name}</td>
                        <td className="muted">{r.email}</td>
                        {fields.map((f) => <td key={f.key}>{r[f.key] ?? ""}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importRows.length > 50 && (
                  <p className="hint" style={{ marginTop: 8 }}>…and {importRows.length - 50} more</p>
                )}
              </div>
            </>
          )}
        </Modal>
      )}

      {qrFor && <QrModal eventId={eventId} participant={qrFor} onClose={() => setQrFor(null)} />}
      {send && <SendProgress state={send} onClose={() => setSend(null)} />}
    </div>
  );
}
