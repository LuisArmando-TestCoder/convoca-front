"use client";

import { useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { downloadCsv, parseCsv, participantsToCsv, type Row } from "@/lib/csv";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import QrModal from "@/components/QrModal";
import type { Participant } from "@/lib/types";

interface Props {
  eventId: string;
  participants: Participant[];
  onChange: () => void;
}

const BLANK = { name: "", email: "", country: "", phone: "" };
type Fields = typeof BLANK;
type BulkResult = { ok: number; failed: number; errors: string[] };

const TEMPLATE_CSV = "name,email,country,phone\nJane Doe,jane@example.com,United States,+1 555 0100";

export default function ParticipantsPanel({ eventId, participants, onChange }: Props) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Fields>(BLANK);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Participant | null>(null);
  const [editForm, setEditForm] = useState<Fields>(BLANK);
  const [savingEdit, setSavingEdit] = useState(false);
  const [qrFor, setQrFor] = useState<Participant | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<Row[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<null | "resend" | "delete">(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return participants;
    return participants.filter((p) =>
      [p.name, p.email, p.country, p.phone].some((v) => v.toLowerCase().includes(q))
    );
  }, [participants, query]);

  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.hash));
  const selectedList = useMemo(() => filtered.filter((p) => selected.has(p.hash)), [filtered, selected]);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const setEdit = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEditForm((f) => ({ ...f, [k]: e.target.value }));

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
  const clearSelection = () => setSelected(new Set());

  async function addOne(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ created: boolean; emailed: boolean }>(`/api/events/${eventId}/participants`, {
        method: "POST",
        body: form,
      });
      toast.push(res.created ? (res.emailed ? "Added — QR emailed." : "Added (email failed).") : "Already registered.", res.created ? "ok" : "info");
      setForm(BLANK);
      setShowAdd(false);
      onChange();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Add failed.", "err");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(p: Participant) {
    setEditForm({ name: p.name, email: p.email, country: p.country, phone: p.phone });
    setEditing(p);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSavingEdit(true);
    try {
      await api(`/api/events/${eventId}/participants/${editing.hash}`, { method: "PATCH", body: editForm });
      toast.push("Participant updated. Their QR changed — send it again.", "ok");
      setEditing(null);
      onChange();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Update failed.", "err");
    } finally {
      setSavingEdit(false);
    }
  }

  // ── CSV import (instructions → drag & drop → preview → import) ──────────────
  function openImport() {
    setImportRows(null);
    setShowImport(true);
  }
  function closeImport() {
    setShowImport(false);
    setImportRows(null);
    if (fileRef.current) fileRef.current.value = "";
  }
  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(String(reader.result));
      if (rows.length === 0) {
        toast.push("No rows found. Your CSV needs headers: name, email, country, phone.", "err");
        return;
      }
      setImportRows(rows);
    };
    reader.readAsText(file);
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
      const res = await api<{ created: number; skipped: number; emailed: number; errors: string[] }>(
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

  async function runBulk(action: "resend" | "delete") {
    const hashes = selectedList.map((p) => p.hash);
    if (hashes.length === 0) return;
    if (action === "delete" && !confirm(`Delete ${hashes.length} selected participant(s)?`)) return;
    setBulkBusy(action);
    try {
      const res = await api<BulkResult>(`/api/events/${eventId}/participants/bulk`, {
        method: "POST",
        body: { action, hashes },
      });
      const verb = action === "resend" ? "sent" : "deleted";
      toast.push(`${res.ok} ${verb}${res.failed ? ` · ${res.failed} failed` : ""}.`, res.failed ? "info" : "ok");
      clearSelection();
      onChange();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Bulk action failed.", "err");
    } finally {
      setBulkBusy(null);
    }
  }

  return (
    <div>
      <div className="row wrap gap-8" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <input
          className="input"
          style={{ maxWidth: 260 }}
          placeholder="Search participants…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="row gap-8 wrap">
          <button className="btn btn--ghost btn--sm" onClick={openImport}>Import CSV</button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => downloadCsv("participants.csv", participantsToCsv(participants))}
            disabled={participants.length === 0}
          >
            Export CSV
          </button>
          <button className="btn btn--primary btn--sm" onClick={() => setShowAdd(true)}>+ Add participant</button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="bulkbar">
          <strong className="small">{selected.size} selected</strong>
          <div className="grow" />
          <button className="btn btn--primary btn--sm" onClick={() => runBulk("resend")} disabled={bulkBusy !== null}>
            {bulkBusy === "resend" ? <span className="spinner" /> : "Send QR"}
          </button>
          <button className="btn btn--danger btn--sm" onClick={() => runBulk("delete")} disabled={bulkBusy !== null}>
            {bulkBusy === "delete" ? <span className="spinner" /> : "Delete"}
          </button>
          <button className="btn btn--ghost btn--sm" onClick={clearSelection} disabled={bulkBusy !== null}>Clear</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card center" style={{ padding: 40 }}>
          <p className="muted">{participants.length === 0 ? "No participants yet. Add one or import a CSV." : "No matches."}</p>
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
                <th>Name</th><th>Email</th><th>Country</th><th>Status</th><th>QR</th><th className="actions">Actions</th>
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
                  <td>{p.country}</td>
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
            <div className="field"><label>Name</label><input className="input" value={form.name} onChange={set("name")} required /></div>
            <div className="field"><label>Email</label><input className="input" type="email" value={form.email} onChange={set("email")} required /></div>
            <div className="row gap-12 wrap">
              <div className="field grow" style={{ minWidth: 160 }}><label>Country</label><input className="input" value={form.country} onChange={set("country")} required /></div>
              <div className="field grow" style={{ minWidth: 160 }}><label>Phone</label><input className="input" value={form.phone} onChange={set("phone")} required /></div>
            </div>
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
            <p className="hint" style={{ marginBottom: 12 }}>
              Editing any field changes the QR code, so it must be sent again after saving.
            </p>
            <div className="field"><label>Name</label><input className="input" value={editForm.name} onChange={setEdit("name")} required /></div>
            <div className="field"><label>Email</label><input className="input" type="email" value={editForm.email} onChange={setEdit("email")} required /></div>
            <div className="row gap-12 wrap">
              <div className="field grow" style={{ minWidth: 160 }}><label>Country</label><input className="input" value={editForm.country} onChange={setEdit("country")} required /></div>
              <div className="field grow" style={{ minWidth: 160 }}><label>Phone</label><input className="input" value={editForm.phone} onChange={setEdit("phone")} required /></div>
            </div>
            <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
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
                <strong className="small">Your CSV needs a header row with these columns:</strong>
                <ul className="spec-list">
                  <li><code>name</code> — the participant&apos;s full name</li>
                  <li><code>email</code> — where their QR ticket is sent</li>
                  <li><code>country</code></li>
                  <li><code>phone</code></li>
                </ul>
                <p className="hint" style={{ marginTop: 10 }}>
                  Column order doesn&apos;t matter and common aliases work (e.g. &ldquo;correo&rdquo;, &ldquo;teléfono&rdquo;).
                  Duplicates are skipped. Imported people are added <strong>pending</strong> — no email is sent until you send it.
                </p>
                <button className="btn btn--ghost btn--sm mt-8" onClick={() => downloadCsv("participants-template.csv", TEMPLATE_CSV)}>
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
                <strong>Drag &amp; drop your CSV here</strong>
                <span className="dropzone__hint">or click to browse</span>
              </div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onInputChange} />
            </>
          ) : (
            <>
              <p className="muted">
                Found <strong>{importRows.length}</strong> row(s). Duplicates are skipped; imported people are
                added <strong>pending</strong> — send their QR when ready.
              </p>
              <div style={{ maxHeight: 240, overflowY: "auto", marginTop: 12 }}>
                <table className="table">
                  <thead><tr><th>Name</th><th>Email</th><th>Country</th><th>Phone</th></tr></thead>
                  <tbody>
                    {importRows.slice(0, 50).map((r, i) => (
                      <tr key={i}><td>{r.name}</td><td className="muted">{r.email}</td><td>{r.country}</td><td>{r.phone}</td></tr>
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
    </div>
  );
}
