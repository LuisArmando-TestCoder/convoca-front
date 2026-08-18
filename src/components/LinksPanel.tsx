"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import type { EventField, SelfRegLink } from "@/lib/types";

const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";

function uniqueKey(base: string, taken: Set<string>): string {
  let key = slug(base);
  while (taken.has(key)) key += "_";
  return key;
}

/** Manage shareable self-registration links for an event. Each link carries its
 *  own display name + field schema (WYSIWYG), defaulting to the event's fields. */
export default function LinksPanel({ eventId, fields }: { eventId: string; fields: EventField[] }) {
  const toast = useToast();
  const [links, setLinks] = useState<SelfRegLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<null | { link: SelfRegLink | null }>(null);

  async function load() {
    try {
      const { links } = await api<{ links: SelfRegLink[] }>(`/api/events/${eventId}/links`);
      setLinks(links);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [eventId]);

  async function save(
    link: SelfRegLink | null,
    name: string,
    linkFields: EventField[],
    active: boolean,
    application: boolean,
  ) {
    try {
      if (link) {
        await api(`/api/events/${eventId}/links/${link.id}`, {
          method: "PATCH",
          body: { name, fields: linkFields, active, application },
        });
        toast.push("Link updated.", "ok");
      } else {
        await api(`/api/events/${eventId}/links`, {
          method: "POST",
          body: { name, fields: linkFields, application },
        });
        toast.push("Registration link created.", "ok");
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Save failed.", "err");
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

  async function remove(link: SelfRegLink) {
    if (!confirm(`Delete this registration link? People with the link will no longer be able to register.`)) return;
    try {
      await api(`/api/events/${eventId}/links/${link.id}`, { method: "DELETE" });
      toast.push("Link deleted.", "ok");
      load();
    } catch {
      toast.push("Delete failed.", "err");
    }
  }

  function copy(url: string) {
    navigator.clipboard.writeText(url).then(() => toast.push("Link copied.", "ok"));
  }

  return (
    <div>
      <div className="row wrap gap-8" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <p className="muted" style={{ maxWidth: 520 }}>
          Share a link so people register themselves. Each link has its own name and registration
          form — create one, then edit its options to match how you want it to look.
        </p>
        <button className="btn btn--primary btn--sm" onClick={() => setEditing({ link: null })}>+ New link</button>
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
                <strong>{l.name || "Untitled link"}</strong>
                <div className="mt-8">
                  <code className="small" style={{ wordBreak: "break-all" }}>{l.url}</code>
                </div>
                <div className="mt-8">
                  {l.active ? <span className="badge badge--ok">Active</span> : <span className="badge badge--pending">Disabled</span>}
                  {l.application && <span className="badge badge--warn" style={{ marginLeft: 8 }}>Application</span>}
                  <span className="muted small" style={{ marginLeft: 8 }}>{l.fields?.length ?? 0} field{(l.fields?.length ?? 0) === 1 ? "" : "s"}</span>
                </div>
              </div>
              <div className="row gap-8 wrap">
                <button className="btn btn--ghost btn--sm" onClick={() => copy(l.url)}>Copy</button>
                <a className="btn btn--ghost btn--sm" href={l.url} target="_blank" rel="noreferrer">Open</a>
                <button className="btn btn--ghost btn--sm" onClick={() => setEditing({ link: l })}>Edit</button>
                <button className="btn btn--ghost btn--sm" onClick={() => toggle(l)}>{l.active ? "Disable" : "Enable"}</button>
                <button className="btn btn--danger btn--sm" onClick={() => remove(l)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <LinkEditorModal
          link={editing.link}
          defaultFields={fields}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  );
}

/** Modal that edits a link's name + fields with a live WYSIWYG preview. */
function LinkEditorModal({
  link,
  defaultFields,
  onClose,
  onSave,
}: {
  link: SelfRegLink | null;
  defaultFields: EventField[];
  onClose: () => void;
  onSave: (link: SelfRegLink | null, name: string, fields: EventField[], active: boolean, application: boolean) => void;
}) {
  const [name, setName] = useState(link?.name ?? "");
  const [active, setActive] = useState(link?.active ?? true);
  const [application, setApplication] = useState(link?.application ?? false);
  const [fields, setFields] = useState<EventField[]>(link?.fields?.length ? link.fields : defaultFields);
  const [busy, setBusy] = useState(false);

  const takenKeys = () => new Set(fields.map((f) => f.key));
  const addField = (label: string) =>
    setFields((fs) => [...fs, { key: uniqueKey(label || "field", takenKeys()), label, required: false }]);
  const updateField = (i: number, patch: Partial<EventField>) =>
    setFields((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const removeField = (i: number) => setFields((fs) => fs.filter((_, idx) => idx !== i));
  const usedLabels = new Set(fields.map((f) => f.label.trim().toLowerCase()));
  const EXAMPLES = ["Country", "Phone", "Company", "Job title", "Ticket type"];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(link, name.trim(), fields, active, application);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={link ? "Edit registration link" : "New registration link"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="link-form" className="btn btn--primary" disabled={busy}>
            {busy ? <span className="spinner" /> : link ? "Save changes" : "Create link"}
          </button>
        </>
      }
    >
      <form id="link-form" onSubmit={submit}>
        <div className="field" style={{ marginBottom: 20 }}>
          <label htmlFor="link-name">Link name</label>
          <input
            id="link-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. VIP registration"
            autoFocus
          />
          <p className="hint" style={{ margin: "4px 0 0" }}>Shown as the title on the registration page.</p>
        </div>

        <div className="stack gap-10" style={{ marginBottom: 20 }}>
          <label className="row gap-8" style={{ alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" className="check" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span className="small">Link is active</span>
          </label>

          <label className="row gap-8" style={{ alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" className="check" checked={application} onChange={(e) => setApplication(e.target.checked)} />
            <span className="small">Application link</span>
          </label>
          <p className="hint" style={{ margin: "0 0 0 25px" }}>
            Registrants are held for review — no QR is emailed until you accept them from the participants list.
          </p>
        </div>

        {/* ── Field builder ─────────────────────────────────────────────── */}
        <div className="fieldset" style={{ marginTop: 0 }}>
          <div className="fieldset__head">
            <div>
              <strong className="small">Registration form</strong>
              <p className="hint" style={{ margin: "2px 0 0" }}>
                Everyone fills <strong>name</strong> and <strong>email</strong>. Add extra fields for this link.
              </p>
            </div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => addField("")}>+ Add field</button>
          </div>

          {fields.length > 0 && (
            <div className="stack gap-8" style={{ marginTop: 14 }}>
              {fields.map((f, i) => (
                <div className="fieldrow" key={f.key}>
                  <input
                    className="input"
                    value={f.label}
                    placeholder="Field label (e.g. Country)"
                    onChange={(e) => updateField(i, { label: e.target.value })}
                  />
                  <label className="fieldrow__req small" title="Required to register">
                    <input
                      type="checkbox"
                      className="check"
                      checked={f.required}
                      onChange={(e) => updateField(i, { required: e.target.checked })}
                    />
                    Required
                  </label>
                  <button type="button" className="btn btn--danger btn--sm" onClick={() => removeField(i)} aria-label="Remove field">✕</button>
                </div>
              ))}
            </div>
          )}

          <div className="row gap-8 wrap" style={{ marginTop: 14 }}>
            <span className="hint">Examples:</span>
            {EXAMPLES.filter((ex) => !usedLabels.has(ex.toLowerCase())).map((ex) => (
              <button type="button" key={ex} className="chip" onClick={() => addField(ex)}>+ {ex}</button>
            ))}
          </div>
        </div>

        {/* ── WYSIWYG preview ───────────────────────────────────────────── */}
        <div className="fieldset" style={{ marginTop: 16 }}>
          <div className="fieldset__head">
            <div>
              <strong className="small">Preview</strong>
              <p className="hint" style={{ margin: "2px 0 0" }}>How the registration page will look.</p>
            </div>
          </div>
          <div className="card" style={{ marginTop: 14, padding: 20, background: "var(--surface)" }}>
            <span className="badge badge--info">Your organization</span>
            <h3 className="mt-8" style={{ marginBottom: 4 }}>{name.trim() || "Untitled link"}</h3>
            <p className="muted small">Step 1 of {fields.length + 2}</p>
            <div className="field mt-8">
              <label className="small">What's your full name?</label>
              <input className="input" placeholder="As you'd like it on your ticket." disabled />
            </div>
            {fields.map((f) => (
              <div className="field mt-8" key={f.key}>
                <label className="small">{f.label}{f.required ? "" : " (optional)"}</label>
                <input className="input" placeholder={f.required ? "" : "Optional"} disabled />
              </div>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}