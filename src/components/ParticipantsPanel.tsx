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

export default function ParticipantsPanel({ eventId, participants, onChange }: Props) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [qrFor, setQrFor] = useState<Participant | null>(null);
  const [importRows, setImportRows] = useState<Row[] | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return participants;
    return participants.filter((p) =>
      [p.name, p.email, p.country, p.phone].some((v) => v.toLowerCase().includes(q))
    );
  }, [participants, query]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

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

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(String(reader.result));
      if (rows.length === 0) toast.push("No rows found. Need headers: name, email, country, phone.", "err");
      setImportRows(rows);
    };
    reader.readAsText(file);
  }

  async function commitImport() {
    if (!importRows) return;
    setImporting(true);
    try {
      const res = await api<{ created: number; skipped: number; emailed: number; errors: string[] }>(
        `/api/events/${eventId}/participants/csv`,
        { method: "POST", body: { rows: importRows } },
      );
      toast.push(`Imported ${res.created} · skipped ${res.skipped} · emailed ${res.emailed}.`, "ok");
      if (res.errors.length) toast.push(`${res.errors.length} row error(s).`, "err");
      setImportRows(null);
      if (fileRef.current) fileRef.current.value = "";
      onChange();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Import failed.", "err");
    } finally {
      setImporting(false);
    }
  }

  async function resend(p: Participant) {
    try {
      await api(`/api/events/${eventId}/participants/${p.hash}/resend`, { method: "POST", body: {} });
      toast.push(`QR re-sent to ${p.email}.`, "ok");
    } catch {
      toast.push("Resend failed.", "err");
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
          <button className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()}>Import CSV</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
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

      {filtered.length === 0 ? (
        <div className="card center" style={{ padding: 40 }}>
          <p className="muted">{participants.length === 0 ? "No participants yet. Add one or import a CSV." : "No matches."}</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Country</th><th>Status</th><th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.hash}>
                  <td>{p.name}</td>
                  <td className="muted">{p.email}</td>
                  <td>{p.country}</td>
                  <td>
                    {p.registered
                      ? <span className="badge badge--ok">✓ Checked in</span>
                      : <span className="badge badge--pending">Pending</span>}
                  </td>
                  <td className="actions">
                    <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
                      <button className="btn btn--ghost btn--sm" onClick={() => setQrFor(p)}>QR</button>
                      <button className="btn btn--ghost btn--sm" onClick={() => resend(p)}>Resend</button>
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

      {importRows && (
        <Modal
          title="Import participants"
          onClose={() => setImportRows(null)}
          footer={
            <>
              <button className="btn btn--ghost" onClick={() => setImportRows(null)}>Cancel</button>
              <button className="btn btn--primary" onClick={commitImport} disabled={importing || importRows.length === 0}>
                {importing ? <span className="spinner" /> : `Import ${importRows.length}`}
              </button>
            </>
          }
        >
          <p className="muted">
            Found <strong>{importRows.length}</strong> row(s). Each gets a QR emailed on creation;
            duplicates are skipped.
          </p>
          <div style={{ maxHeight: 220, overflowY: "auto", marginTop: 12 }}>
            <table className="table">
              <thead><tr><th>Name</th><th>Email</th><th>Country</th></tr></thead>
              <tbody>
                {importRows.slice(0, 50).map((r, i) => (
                  <tr key={i}><td>{r.name}</td><td className="muted">{r.email}</td><td>{r.country}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {qrFor && <QrModal eventId={eventId} participant={qrFor} onClose={() => setQrFor(null)} />}
    </div>
  );
}
