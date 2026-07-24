"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { useSession } from "@/components/session";
import StatsPanel from "@/components/StatsPanel";
import ParticipantsPanel from "@/components/ParticipantsPanel";
import LinksPanel from "@/components/LinksPanel";
import EventFields, { type EventFormState } from "@/components/EventFields";
import { MODE_LABELS, type EventDoc, type EventStats, type Participant } from "@/lib/types";

type Tab = "overview" | "participants" | "registration" | "settings";

const toForm = (ev: EventDoc): EventFormState => ({
  name: ev.name,
  description: ev.description ?? "",
  location: ev.location ?? "",
  mode: ev.mode,
  date: ev.date ? ev.date.slice(0, 16) : "",
  quota: ev.quota != null ? String(ev.quota) : "",
});

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const me = useSession();

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [stats, setStats] = useState<EventStats | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<EventFormState | null>(null);
  const [saving, setSaving] = useState(false);

  const loadParticipants = useCallback(async () => {
    const [{ participants }, statsRes] = await Promise.all([
      api<{ participants: Participant[] }>(`/api/events/${id}/participants`),
      api<EventStats>(`/api/events/${id}/stats`),
    ]);
    setParticipants(participants);
    setStats(statsRes);
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        const { event } = await api<{ event: EventDoc }>(`/api/events/${id}`);
        setEvent(event);
        setSettings(toForm(event));
        await loadParticipants();
      } catch (err) {
        toast.push(err instanceof ApiError ? err.message : "Failed to load event.", "err");
        if (err instanceof ApiError && err.status === 404) router.replace("/dashboard");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const setField = (k: keyof EventFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setSettings((f) => (f ? { ...f, [k]: e.target.value } : f));

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const { event: updated } = await api<{ event: EventDoc }>(`/api/events/${id}`, {
        method: "PATCH",
        body: { ...settings, quota: settings.quota ? Number(settings.quota) : null },
      });
      setEvent(updated);
      setSettings(toForm(updated));
      toast.push("Event saved.", "ok");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Save failed.", "err");
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent() {
    if (!event || !confirm(`Delete "${event.name}" and all its participants?`)) return;
    try {
      await api(`/api/events/${id}`, { method: "DELETE" });
      toast.push("Event deleted.", "ok");
      router.replace("/dashboard");
    } catch {
      toast.push("Delete failed.", "err");
    }
  }

  if (loading || !event) {
    return <div className="center" style={{ padding: 60 }}><span className="spinner spinner--dark" /></div>;
  }

  const TABS: [Tab, string][] = [
    ["overview", "Overview"],
    ["participants", `Participants${participants.length ? ` (${participants.length})` : ""}`],
    ["registration", "Registration links"],
    ["settings", "Settings"],
  ];

  return (
    <div>
      <div className="row wrap gap-12" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <Link href="/dashboard" className="small muted">← All events</Link>
          <h1 className="mt-8">{event.name}</h1>
          <div className="row gap-8 wrap mt-8">
            <span className="badge badge--info">{MODE_LABELS[event.mode]}</span>
            {event.date && <span className="muted small">📅 {new Date(event.date).toLocaleString()}</span>}
            {event.location && <span className="muted small">📍 {event.location}</span>}
          </div>
        </div>
        <Link href={`/dashboard/events/${id}/scan`} className="btn btn--primary">📷 Open scanner</Link>
      </div>

      <div className="tabs mt-16">
        {TABS.map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? "tab--active" : ""}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (stats ? <StatsPanel stats={stats} /> : null)}
      {tab === "participants" && (
        <ParticipantsPanel eventId={id} participants={participants} onChange={loadParticipants} />
      )}
      {tab === "registration" && <LinksPanel eventId={id} />}
      {tab === "settings" && settings && (
        <div className="stack gap-16" style={{ maxWidth: 560 }}>
          <form className="card" onSubmit={saveSettings}>
            <h3 style={{ marginBottom: 14 }}>Event details</h3>
            <EventFields form={settings} set={setField} />
            <div className="row gap-8 mt-8" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn--primary" disabled={saving}>
                {saving ? <span className="spinner" /> : "Save changes"}
              </button>
            </div>
          </form>

          <div className="card">
            <h3>Danger zone</h3>
            <p className="muted small mt-8">Deleting removes the event and every participant record. This can&apos;t be undone.</p>
            {me.role === "owner" ? (
              <button className="btn btn--danger mt-16" onClick={removeEvent}>Delete event</button>
            ) : (
              <p className="muted small mt-16">Only the owner can delete events.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
