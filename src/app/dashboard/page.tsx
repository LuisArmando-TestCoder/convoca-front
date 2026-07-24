"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import EventFields, { BLANK_EVENT } from "@/components/EventFields";
import { MODE_LABELS, type EventDoc, type EventField } from "@/lib/types";


const BLANK = BLANK_EVENT;


export default function EventsPage() {
  const toast = useToast();
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { events } = await api<{ events: EventDoc[] }>("/api/events");
      setEvents(events);
    } catch {
      toast.push("Failed to load events.", "err");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const setFields = (fields: EventField[]) => setForm((f) => ({ ...f, fields }));


  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/events", {
        method: "POST",
        body: { ...form, quota: form.quota ? Number(form.quota) : null },
      });
      toast.push("Event created.", "ok");
      setShowCreate(false);
      setForm(BLANK);
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Create failed.", "err");
    } finally {
      setBusy(false);
    }
  }

  async function clone(ev: EventDoc) {
    try {
      await api(`/api/events/${ev.id}/clone`, { method: "POST", body: {} });
      toast.push(`Cloned "${ev.name}".`, "ok");
      load();
    } catch {
      toast.push("Clone failed.", "err");
    }
  }

  return (
    <div>
      <div className="row wrap gap-12" style={{ justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1>Events</h1>
          <p className="muted mt-8">Create an event, invite participants, and check them in.</p>
        </div>
        <button className="btn btn--primary" onClick={() => setShowCreate(true)}>+ New event</button>
      </div>

      {loading ? (
        <div className="center" style={{ padding: 40 }}><span className="spinner spinner--dark" /></div>
      ) : events.length === 0 ? (
        <div className="card center" style={{ padding: 48 }}>
          <h2>No events yet</h2>
          <p className="muted mt-8">Create your first event to start inviting participants.</p>
          <button className="btn btn--primary mt-16" onClick={() => setShowCreate(true)}>+ New event</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 18 }}>
          {events.map((ev) => (
            <div className="card card--hover" key={ev.id}>
              <div className="row wrap gap-8" style={{ justifyContent: "space-between" }}>
                <span className="badge badge--info">{MODE_LABELS[ev.mode]}</span>
                {ev.clonedFrom && <span className="badge badge--pending">clone</span>}
              </div>
              <h2 className="mt-8">{ev.name}</h2>
              {ev.date && <p className="muted small mt-8">📅 {new Date(ev.date).toLocaleString()}</p>}
              {ev.location && <p className="muted small">📍 {ev.location}</p>}
              {ev.quota != null && <p className="muted small">🎟️ Quota: {ev.quota}</p>}
              <div className="row gap-8 mt-16 wrap">
                <Link href={`/dashboard/events/${ev.id}`} className="btn btn--primary btn--sm">Open</Link>
                <Link href={`/dashboard/events/${ev.id}/scan`} className="btn btn--ghost btn--sm">Scan</Link>
                <button className="btn btn--ghost btn--sm" onClick={() => clone(ev)}>Clone</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal title="New event" onClose={() => setShowCreate(false)}>
          <form onSubmit={create}>
            <EventFields form={form} set={set} setFields={setFields} />
            <div className="row gap-8 mt-8" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn--ghost" onClick={() => setShowCreate(false)}>Cancel</button>

              <button className="btn btn--primary" disabled={busy}>{busy ? <span className="spinner" /> : "Create event"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
