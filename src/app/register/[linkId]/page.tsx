"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { MODE_LABELS, type EventField, type EventMode } from "@/lib/types";

interface LinkInfo {
  orgName: string;
  linkName: string;
  event: {
    name: string;
    description: string;
    date: string;
    location: string;
    mode: EventMode;
    fields: EventField[];
  };
}

interface Step {
  key: string;
  label: string;
  hint: string;
  type: string;
  required: boolean;
  custom: boolean;
}

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function SelfRegisterPage() {
  const { linkId } = useParams<{ linkId: string }>();
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [fieldVals, setFieldVals] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { already: boolean }>(null);

  useEffect(() => {
    api<LinkInfo>(`/api/public/register/${linkId}`, { auth: false })
      .then(setInfo)
      .catch((err) => setLoadErr(err instanceof ApiError ? err.message : "This link is unavailable."));
  }, [linkId]);

  // Built-in name + email, then one step per team-defined field.
  const steps: Step[] = useMemo(() => {
    const base: Step[] = [
      { key: "name", label: "What's your full name?", hint: "As you'd like it on your ticket.", type: "text", required: true, custom: false },
      { key: "email", label: "Your email", hint: "We'll send your check-in QR here.", type: "email", required: true, custom: false },
    ];
    const extra: Step[] = (info?.event.fields ?? []).map((f) => ({
      key: f.key,
      label: f.label,
      hint: f.required ? "" : "Optional",
      type: "text",
      required: f.required,
      custom: true,
    }));
    return [...base, ...extra];
  }, [info]);

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const value = !current ? "" : current.key === "name" ? name : current.key === "email" ? email : (fieldVals[current.key] ?? "");
  const valid = !current
    ? false
    : current.key === "email"
    ? emailOk(value)
    : current.required
    ? value.trim().length > 0
    : true;

  const setValue = (v: string) => {
    if (!current) return;
    if (current.key === "name") setName(v);
    else if (current.key === "email") setEmail(v);
    else setFieldVals((f) => ({ ...f, [current.key]: v }));
  };

  function goNext() {
    setDir("fwd");
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }
  function goBack() {
    setLoadErr(null);
    setDir("back");
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    setBusy(true);
    setLoadErr(null);
    try {
      const res = await api<{ alreadyRegistered: boolean }>(`/api/public/register/${linkId}`, {
        method: "POST",
        auth: false,
        body: { name, email, fields: fieldVals },
      });
      setDone({ already: res.alreadyRegistered });
    } catch (err) {
      setLoadErr(err instanceof ApiError ? err.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    if (isLast) void submit();
    else goNext();
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
                : `We emailed your check-in QR to ${email}. Show it at the door.`}
            </p>
          </div>
        ) : (
          <div className="card card--pad-lg">
            <span className="badge badge--info">{info.orgName}</span>
            <h1 className="mt-8">{info.linkName || info.event.name}</h1>
            <div className="row gap-8 wrap mt-8" style={{ marginBottom: 8 }}>
              <span className="badge badge--pending">{MODE_LABELS[info.event.mode]}</span>
              {info.event.date && <span className="muted small">📅 {new Date(info.event.date).toLocaleString()}</span>}
              {info.event.location && <span className="muted small">📍 {info.event.location}</span>}
            </div>
            {info.event.description && <p className="muted small" style={{ whiteSpace: "pre-wrap" }}>{info.event.description}</p>}

            <div className="stepper__dots mt-16">
              {steps.map((s, i) => (
                <span
                  key={s.key}
                  className={`stepper__dot ${i === step ? "stepper__dot--active" : i < step ? "stepper__dot--done" : ""}`}
                />
              ))}
            </div>

            <form onSubmit={onSubmit}>
              <div key={step} className={dir === "back" ? "step-anim--back" : "step-anim"}>
                <div className="step__label">{current.label}{current.required ? "" : " (optional)"}</div>
                {current.hint && <p className="step__hint">{current.hint}</p>}
                <input
                  className="input input--lg"
                  type={current.type}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  autoFocus
                  required={current.required}
                />
              </div>

              {loadErr && <p className="small mt-8" style={{ color: "var(--danger)" }}>{loadErr}</p>}

              <div className="row gap-8 mt-16">
                {step > 0 && (
                  <button type="button" className="btn btn--ghost" onClick={goBack} disabled={busy}>← Back</button>
                )}
                <div className="grow" />
                <button className="btn btn--primary" disabled={!valid || busy}>
                  {busy ? <span className="spinner" /> : isLast ? "Register & email my QR" : "Continue"}
                </button>
              </div>
            </form>

            <p className="step__count">Step {step + 1} of {steps.length}</p>
          </div>
        )}
        <p className="center muted small mt-16">Powered by Convoca</p>
      </div>
    </div>
  );
}
