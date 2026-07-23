"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { SelfRegLink } from "@/lib/types";

/** Manage shareable self-registration links for an event. */
export default function LinksPanel({ eventId }: { eventId: string }) {
  const toast = useToast();
  const [links, setLinks] = useState<SelfRegLink[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const { links } = await api<{ links: SelfRegLink[] }>(`/api/events/${eventId}/links`);
      setLinks(links);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [eventId]);

  async function create() {
    try {
      await api(`/api/events/${eventId}/links`, { method: "POST", body: {} });
      toast.push("Registration link created.", "ok");
      load();
    } catch {
      toast.push("Could not create link.", "err");
    }
  }

  async function toggle(link: SelfRegLink) {
    try {
      await api(`/api/events/${eventId}/links/${link.id}`, { method: "PATCH", body: { active: !link.active } });
      load();
    } catch {
      toast.push("Update failed.", "err");
    }
  }

  function copy(url: string) {
    navigator.clipboard.writeText(url).then(() => toast.push("Link copied.", "ok"));
  }

  return (
    <div>
      <div className="row wrap gap-8" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <p className="muted" style={{ maxWidth: 520 }}>
          Share a link so people register themselves. Each self-registration gets a QR emailed
          automatically — same as adding them manually.
        </p>
        <button className="btn btn--primary btn--sm" onClick={create}>+ New link</button>
      </div>

      {loading ? (
        <div className="center" style={{ padding: 30 }}><span className="spinner spinner--dark" /></div>
      ) : links.length === 0 ? (
        <div className="card center" style={{ padding: 40 }}>
          <p className="muted">No registration links yet.</p>
        </div>
      ) : (
        <div className="stack gap-12">
          {links.map((l) => (
            <div className="card row wrap gap-12" key={l.id} style={{ justifyContent: "space-between" }}>
              <div className="grow" style={{ minWidth: 220 }}>
                <code className="small" style={{ wordBreak: "break-all" }}>{l.url}</code>
                <div className="mt-8">
                  {l.active ? <span className="badge badge--ok">Active</span> : <span className="badge badge--pending">Disabled</span>}
                </div>
              </div>
              <div className="row gap-8">
                <button className="btn btn--ghost btn--sm" onClick={() => copy(l.url)}>Copy</button>
                <a className="btn btn--ghost btn--sm" href={l.url} target="_blank" rel="noreferrer">Open</a>
                <button className="btn btn--ghost btn--sm" onClick={() => toggle(l)}>{l.active ? "Disable" : "Enable"}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
