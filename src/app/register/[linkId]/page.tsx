"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { MODE_LABELS, type EventMode } from "@/lib/types";

interface LinkInfo {
  orgName: string;
  event: { name: string; description: string; date: string; location: string; mode: EventMode };
}

const BLANK = { name: "", email: "", country: "", phone: "" };

export default function SelfRegisterPage() {
  const { linkId } = useParams<{ linkId: string }>();
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { already: boolean }>(null);

  useEffect(() => {
    api<LinkInfo>(`/api/public/register/${linkId}`, { auth: false })
      .then(setInfo)
      .catch((err) => setLoadErr(err instanceof ApiError ? err.message : "This link is unavailable."));
  }, [linkId]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ alreadyRegistered: boolean }>(`/api/public/register/${linkId}`, {
        method: "POST",
        auth: false,
        body: form,
      });
      setDone({ already: res.alreadyRegistered });
    } catch (err) {
      setLoadErr(err instanceof ApiError ? err.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ maxWidth: 460 }}>
        {loadErr && !info ? (
          <div className="card card--pad-lg center">
            <h1>Unavailable</h1>
            <p className="muted mt-8">{loadErr}</p>
          </div>
        ) : !info ? (
          <div className="card card--pad-lg center" style={{ padding: 48 }}>
            <span className="spinner spinner--dark" />
          </div>
        ) : done ? (
          <div className="card card--pad-lg center">
            <div style={{ fontSize: "2.6rem" }}>🎟️</div>
            <h1 className="mt-8">{done.already ? "Already registered" : "You're registered!"}</h1>
            <p className="muted mt-8">
              {done.already
                ? "This email was already registered for this event — check your inbox for the QR."
                : `We emailed your check-in QR to ${form.email}. Show it at the door.`}
            </p>
          </div>
        ) : (
          <div className="card card--pad-lg">
            <span className="badge badge--info">{info.orgName}</span>
            <h1 className="mt-8">{info.event.name}</h1>
            <div className="row gap-8 wrap mt-8" style={{ marginBottom: 8 }}>
              <span className="badge badge--pending">{MODE_LABELS[info.event.mode]}</span>
              {info.event.date && <span className="muted small">📅 {new Date(info.event.date).toLocaleString()}</span>}
              {info.event.location && <span className="muted small">📍 {info.event.location}</span>}
            </div>
            {info.event.description && <p className="muted small" style={{ whiteSpace: "pre-wrap" }}>{info.event.description}</p>}

            <form onSubmit={submit} className="mt-16">
              <div className="field"><label>Full name</label><input className="input" value={form.name} onChange={set("name")} required /></div>
              <div className="field"><label>Email</label><input className="input" type="email" value={form.email} onChange={set("email")} required /></div>
              <div className="row gap-12 wrap">
                <div className="field grow" style={{ minWidth: 150 }}><label>Country</label><input className="input" value={form.country} onChange={set("country")} required /></div>
                <div className="field grow" style={{ minWidth: 150 }}><label>Phone</label><input className="input" value={form.phone} onChange={set("phone")} required /></div>
              </div>
              {loadErr && <p className="small" style={{ color: "var(--danger)" }}>{loadErr}</p>}
              <button className="btn btn--primary btn--block mt-8" disabled={busy}>
                {busy ? <span className="spinner" /> : "Register & email my QR"}
              </button>
            </form>
          </div>
        )}
        <p className="center muted small mt-16">Powered by Convoca</p>
      </div>
    </div>
  );
}
