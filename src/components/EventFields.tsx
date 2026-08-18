"use client";

import type { ChangeEvent } from "react";
import type { EventField, EventLink, EventMode } from "@/lib/types";

/** The controlled shape shared by the create modal and the settings editor. */
export interface EventFormState {
  name: string;
  description: string;
  location: string;
  mode: EventMode;
  date: string;
  quota: string;
  /** Team-defined participant fields (beyond the built-in name + email). */
  fields: EventField[];
  /** Links shown on the QR email (label optional). */
  links: EventLink[];
  /** When false, the check-in email omits the QR image + attachment. */
  showQr: boolean;
}

export const BLANK_EVENT: EventFormState = {
  name: "",
  description: "",
  location: "",
  mode: "in_person",
  date: "",
  quota: "",
  fields: [],
  links: [],
  showQr: true,
};

/** Example fields the team can add with one click (not seeded by default). */
const EXAMPLES = ["Country", "Phone", "Company", "Job title", "Ticket type"];

const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";

function uniqueKey(base: string, taken: Set<string>): string {
  let key = slug(base);
  while (taken.has(key)) key += "_";
  return key;
}

type FieldEl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

interface Props {
  form: EventFormState;
  set: (k: keyof EventFormState) => (e: ChangeEvent<FieldEl>) => void;
  setFields: (fields: EventField[]) => void;
  setLinks: (links: EventLink[]) => void;
  setShowQr: (show: boolean) => void;
}

/** Presentational event fields + a builder for team-defined participant fields. */
export default function EventFields({ form, set, setFields, setLinks, setShowQr }: Props) {
  const toggleShowQr = (e: ChangeEvent<HTMLInputElement>) =>
    setShowQr(e.target.checked);
  const fields = form.fields ?? [];
  const links = form.links ?? [];
  const takenKeys = () => new Set(fields.map((f) => f.key));

  const addField = (label: string) =>
    setFields([...fields, { key: uniqueKey(label || "field", takenKeys()), label, required: false }]);

  const updateField = (i: number, patch: Partial<EventField>) =>
    setFields(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  const removeField = (i: number) => setFields(fields.filter((_, idx) => idx !== i));

  const usedLabels = new Set(fields.map((f) => f.label.trim().toLowerCase()));

  return (
    <>
      <div className="field">
        <label htmlFor="name">Event name</label>
        <input id="name" className="input" value={form.name} onChange={set("name")} required />
      </div>
      <div className="field">
        <label htmlFor="desc">Description</label>
        <textarea id="desc" className="textarea" value={form.description} onChange={set("description")} />
      </div>
      <div className="row gap-12 wrap">
        <div className="field grow" style={{ minWidth: 180 }}>
          <label htmlFor="date">Date &amp; time</label>
          <input id="date" className="input" type="datetime-local" value={form.date} onChange={set("date")} />
        </div>
        <div className="field" style={{ minWidth: 140 }}>
          <label htmlFor="mode">Mode</label>
          <select id="mode" className="select" value={form.mode} onChange={set("mode")}>
            <option value="in_person">In person</option>
            <option value="virtual">Virtual</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>
      </div>
      <div className="row gap-12 wrap">
        <div className="field grow" style={{ minWidth: 180 }}>
          <label htmlFor="loc">Location</label>
          <input id="loc" className="input" value={form.location} onChange={set("location")} />
        </div>
        <div className="field" style={{ minWidth: 120 }}>
          <label htmlFor="quota">Quota</label>
          <input id="quota" className="input" type="number" min={1} value={form.quota} onChange={set("quota")} placeholder="∞" />
        </div>
      </div>

      {/* ── Registration form builder ─────────────────────────────────────── */}
      <div className="fieldset">
        <div className="fieldset__head">
          <div>
            <strong className="small">Registration form</strong>
            <p className="hint" style={{ margin: "2px 0 0" }}>
              Everyone fills <strong>name</strong> and <strong>email</strong>. Add any extra fields you want participants to fill.
            </p>
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => addField("")}>+ Add field</button>
        </div>

        {fields.length > 0 && (
          <div className="stack gap-8 mt-12">
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

        <div className="row gap-8 wrap mt-12">
          <span className="hint">Examples:</span>
          {EXAMPLES.filter((ex) => !usedLabels.has(ex.toLowerCase())).map((ex) => (
            <button type="button" key={ex} className="chip" onClick={() => addField(ex)}>+ {ex}</button>
          ))}
        </div>
      </div>

      {/* ── QR email links ─────────────────────────────────────────────────── */}
      <div className="fieldset">
        <div className="fieldset__head">
          <div>
            <strong className="small">QR email links</strong>
            <p className="hint" style={{ margin: "2px 0 0" }}>
              Optional links shown in the check-in email. Leave the URL empty to skip a row.
            </p>
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setLinks([...links, { label: "", url: "" }])}>+ Add link</button>
        </div>

        <label className="fieldrow__req small" style={{ marginTop: 10, display: "inline-flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            className="check"
            checked={form.showQr}
            onChange={toggleShowQr}
          />
          Include QR code in the check-in email
        </label>

        {links.length > 0 && (
          <div className="stack gap-8 mt-12">
            {links.map((l, i) => (
              <div className="fieldrow" key={i}>
                <input
                  className="input"
                  value={l.label}
                  placeholder="Label (optional)"
                  onChange={(e) => setLinks(links.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))}
                />
                <input
                  className="input"
                  value={l.url}
                  placeholder="https://…"
                  onChange={(e) => setLinks(links.map((x, idx) => (idx === i ? { ...x, url: e.target.value } : x)))}
                />
                <button type="button" className="btn btn--danger btn--sm" onClick={() => setLinks(links.filter((_, idx) => idx !== i))} aria-label="Remove link">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
