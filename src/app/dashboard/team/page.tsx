"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { useSession } from "@/components/session";
import Modal from "@/components/Modal";
import type { Collaborator, EventDoc } from "@/lib/types";

export default function TeamPage() {
  const me = useSession();
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState<Collaborator[]>([]);
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", email: "" });
  const [allEvents, setAllEvents] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Collaborator | null>(null);
  const [editAll, setEditAll] = useState(true);
  const [editSelected, setEditSelected] = useState<Set<string>>(new Set());
  const [editBusy, setEditBusy] = useState(false);

  // Collaborators can't manage the team — bounce them to events.
  useEffect(() => {
    if (me.role !== "owner") router.replace("/dashboard");
  }, [me.role, router]);

  async function load() {
    try {
      const [{ collaborators }, { events: evs }] = await Promise.all([
        api<{ collaborators: Collaborator[] }>("/api/collaborators"),
        api<{ events: EventDoc[] }>("/api/events"),
      ]);
      setList(collaborators);
      setEvents(evs);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name: form.name, email: form.email };
      if (!allEvents) body.eventIds = [...selected];
      await api("/api/collaborators", { method: "POST", body });
      toast.push("Collaborator invited.", "ok");
      setForm({ name: "", email: "" });
      setAllEvents(true);
      setSelected(new Set());
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Could not add collaborator.", "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Collaborator) {
    if (!confirm(`Remove ${c.name}?`)) return;
    try {
      await api(`/api/collaborators/${encodeURIComponent(c.email)}`, { method: "DELETE" });
      toast.push("Removed.", "ok");
      load();
    } catch {
      toast.push("Delete failed.", "err");
    }
  }

  function openEdit(c: Collaborator) {
    setEditing(c);
    setEditAll(!c.eventIds);
    setEditSelected(new Set(c.eventIds ?? []));
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditBusy(true);
    try {
      const body: Record<string, unknown> = {};
      if (editAll) body.eventIds = null;
      else body.eventIds = [...editSelected];
      await api(`/api/collaborators/${encodeURIComponent(editing.email)}`, { method: "PATCH", body });
      toast.push("Scope updated.", "ok");
      setEditing(null);
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Update failed.", "err");
    } finally {
      setEditBusy(false);
    }
  }

  function scopeLabel(c: Collaborator): string {
    if (!c.eventIds) return "All events";
    if (c.eventIds.length === 0) return "No events";
    const names = c.eventIds
      .map((id) => events.find((ev) => ev.id === id)?.name)
      .filter(Boolean);
    return names.length ? names.join(", ") : `${c.eventIds.length} event(s)`;
  }

  const scopePicker = (all: boolean, setAll: (v: boolean) => void, sel: Set<string>, setSel: (s: Set<string>) => void) => (
    <div className="field" style={{ marginBottom: 0 }}>
      <label>Event access</label>
      <label className="row gap-8" style={{ marginBottom: 8 }}>
        <input type="checkbox" className="check" checked={all} onChange={(e) => setAll(e.target.checked)} />
        <span className="small">All events</span>
      </label>
      {!all && (
        <div className="row gap-8 wrap" style={{ marginTop: 4 }}>
          {events.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>No events yet.</p>
          ) : (
            events.map((ev) => (
              <label key={ev.id} className="row gap-8" style={{ marginBottom: 0 }}>
                <input
                  type="checkbox"
                  className="check"
                  checked={sel.has(ev.id)}
                  onChange={() => setSel(toggle(sel, ev.id))}
                />
                <span className="small">{ev.name}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 720 }}>
      <h1>Team</h1>
      <p className="muted mt-8">
        Invite collaborators by email. They sign in with a one-time code and can manage participants
        and scan check-ins for the events you grant them access to.
      </p>

      <form className="card mt-16" onSubmit={add}>
        <div className="row gap-12 wrap">
          <div className="field grow" style={{ minWidth: 160, marginBottom: 0 }}>
            <label>Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jane Doe" />
          </div>
          <div className="field grow" style={{ minWidth: 200, marginBottom: 0 }}>
            <label>Email</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="jane@company.com" required />
          </div>
        </div>
        <div className="mt-12">{scopePicker(allEvents, setAllEvents, selected, setSelected)}</div>
        <div className="mt-16">
          <button className="btn btn--primary" disabled={busy}>{busy ? <span className="spinner" /> : "Invite"}</button>
        </div>
      </form>

      <div className="mt-24">
        {loading ? (
          <div className="center" style={{ padding: 30 }}><span className="spinner spinner--dark" /></div>
        ) : list.length === 0 ? (
          <div className="card center" style={{ padding: 40 }}><p className="muted">No collaborators yet.</p></div>
        ) : (
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="table">
              <thead><tr><th>Name</th><th>Email</th><th>Access</th><th className="actions">Actions</th></tr></thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.email}>
                    <td>{c.name}</td>
                    <td className="muted">{c.email}</td>
                    <td className="muted">{scopeLabel(c)}</td>
                    <td className="actions">
                      <button className="btn btn--sm" onClick={() => openEdit(c)}>Edit</button>
                      <button className="btn btn--danger btn--sm" onClick={() => remove(c)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <Modal title={`Edit access for ${editing.name}`} onClose={() => setEditing(null)}>
          <form onSubmit={saveEdit}>
            {scopePicker(editAll, setEditAll, editSelected, setEditSelected)}
            <div className="row gap-8 mt-16" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn--primary" disabled={editBusy}>{editBusy ? <span className="spinner" /> : "Save"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}