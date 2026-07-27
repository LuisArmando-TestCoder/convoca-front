"use client";

// ── Live send progress ───────────────────────────────────────────────────────
// A real-time view of a sequential QR-email send, driven entirely by the event
// WebSocket. Every teammate viewing the event sees the same feed. Closing the
// panel doesn't stop the send — it keeps running on the server.

import { useEffect } from "react";

export interface SendItem {
  hash: string;
  name: string;
  email: string;
  status: "sending" | "sent" | "failed";
  reason?: string;
}

export interface SendState {
  total: number;
  by?: string;
  items: SendItem[]; // in arrival order
  done: boolean;
  sent: number;
  failed: number;
  reportedTo: string | null;
}

interface Props {
  state: SendState;
  onClose: () => void;
}

export default function SendProgress({ state, onClose }: Props) {
  const { total, items, done, sent, failed, reportedTo, by } = state;
  const processed = sent + failed;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && done && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, onClose]);

  // Newest first so the active recipient is always in view.
  const feed = [...items].reverse();

  return (
    <div className="modal-overlay" onMouseDown={() => done && onClose()}>
      <div
        className="modal sendbox"
        role="dialog"
        aria-modal="true"
        aria-label="Sending check-in emails"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2>{done ? "Send complete" : "Sending check-in emails…"}</h2>
            <p className="muted small mt-8">
              {done
                ? `${sent} sent · ${failed} failed of ${total}`
                : `${processed} of ${total} · sending one at a time to protect deliverability`}
              {by ? ` · started by ${by}` : ""}
            </p>
          </div>
          <button
            className="btn btn--ghost btn--sm"
            onClick={onClose}
            aria-label="Close"
            title={done ? "Close" : "Hide (send keeps running)"}
          >
            ✕
          </button>
        </div>

        <div className="sendbar mt-16">
          <div className="sendbar__track">
            <div className={`sendbar__fill ${done ? "sendbar__fill--done" : ""}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="row gap-8 mt-8" style={{ justifyContent: "center" }}>
            <span className="badge badge--ok">✓ {sent} sent</span>
            {failed > 0 && <span className="badge badge--warn">✕ {failed} failed</span>}
            <span className="badge badge--pending">{Math.max(total - processed, 0)} left</span>
          </div>
        </div>

        <div className="sendlog mt-16">
          {feed.length === 0 && <p className="muted small center" style={{ padding: 20 }}>Preparing…</p>}
          {feed.map((it) => (
            <div key={it.hash} className={`sendlog__row sendlog__row--${it.status}`}>
              <span className="sendlog__icon">
                {it.status === "sending" ? <span className="spinner spinner--dark" />
                  : it.status === "sent" ? "✓"
                  : "✕"}
              </span>
              <span className="sendlog__who">
                <strong>{it.name}</strong>
                <span className="muted small">{it.email}</span>
              </span>
              {it.status === "failed" && it.reason && (
                <span className="sendlog__reason small">{it.reason}</span>
              )}
            </div>
          ))}
        </div>

        {done && failed > 0 && reportedTo && (
          <p className="hint mt-16">
            A failure report with all {failed} unsent recipient{failed === 1 ? "" : "s"} was emailed to{" "}
            <strong>{reportedTo}</strong>.
          </p>
        )}

        <div className="row gap-8 mt-16" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn--primary" onClick={onClose}>
            {done ? "Done" : "Hide"}
          </button>
        </div>
      </div>
    </div>
  );
}
