"use client";

import type { ChangeEvent } from "react";
import type { EventMode } from "@/lib/types";

/** The controlled shape shared by the create modal and the settings editor. */
export interface EventFormState {
  name: string;
  description: string;
  location: string;
  mode: EventMode;
  date: string;
  quota: string;
}

export const BLANK_EVENT: EventFormState = {
  name: "",
  description: "",
  location: "",
  mode: "in_person",
  date: "",
  quota: "",
};

type FieldEl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

interface Props {
  form: EventFormState;
  set: (k: keyof EventFormState) => (e: ChangeEvent<FieldEl>) => void;
}

/** Presentational event fields — the single source of truth for the event form. */
export default function EventFields({ form, set }: Props) {
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
    </>
  );
}
