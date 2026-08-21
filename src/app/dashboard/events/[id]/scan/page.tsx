"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import type { CheckinResult, EventDoc } from "@/lib/types";

/** Per-outcome presentation for the confirm modal shown over the camera. */
const OUTCOME: Record<
  CheckinResult["outcome"],
  { kind: "success" | "duplicate" | "not_found" | "wrong_event"; title: string }
> = {
  success: { kind: "success", title: "Checked in" },
  duplicate: { kind: "duplicate", title: "Already registered" },
  not_found: { kind: "not_found", title: "Not found" },
  wrong_event: { kind: "wrong_event", title: "Wrong event" },
};

const EASE = [0.22, 1, 0.36, 1] as const;

/** Spring-drawn checkmark with a single expanding ripple. Success only. */
function SuccessMark() {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <div className="scan-mark">
        <svg viewBox="0 0 52 52" width="42" height="42" fill="none" aria-hidden>
          <circle cx="26" cy="26" r="23" stroke="currentColor" strokeWidth="2.5" />
          <path
            d="M16 27.2 L23 34 L37 19"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }
  return (
    <div className="scan-mark">
      <svg viewBox="0 0 52 52" width="42" height="42" fill="none" aria-hidden>
        <motion.circle
          cx="26"
          cy="26"
          r="23"
          stroke="currentColor"
          strokeWidth="2.5"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.45, ease: EASE }}
        />
        <motion.path
          d="M16 27.2 L23 34 L37 19"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.22 }}
        />
      </svg>
      <motion.span
        className="scan-mark__ripple"
        aria-hidden
        initial={{ opacity: 0.45, scale: 0.55 }}
        animate={{ opacity: 0, scale: 1.55 }}
        transition={{ duration: 0.9, ease: "easeOut", delay: 0.15 }}
      />
    </div>
  );
}

/** Calm reference glyphs for non-success outcomes. No emoji, no celebration. */
function StaticGlyph({ kind }: { kind: "duplicate" | "not_found" | "wrong_event" }) {
  if (kind === "duplicate") {
    return (
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden>
        <path d="M12 3.5 L21 20 L3 20 Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <line x1="12" y1="9" x2="12" y2="13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="16.8" r="1.1" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden>
      <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function ScanPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventDoc | null>(null);

  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [camError, setCamError] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);

  const busyRef = useRef(false);

  useEffect(() => {
    api<{ event: EventDoc }>(`/api/events/${id}`).then((r) => setEvent(r.event)).catch(() => {});
  }, [id]);

  async function handleDecode(text: string) {
    // While a result modal is open (busy) we ignore every frame until confirmed.
    if (busyRef.current) return;
    busyRef.current = true;
    const code = text.trim().toLowerCase();
    try {
      const res = await api<CheckinResult>(`/api/events/${id}/checkin`, { method: "POST", body: { hash: code } });
      setResult(res);
    } catch (err) {
      if (err instanceof ApiError) {
        try {
          // 409 (duplicate) / 404 (not found) still carry the structured result.
          setResult(JSON.parse(err.message));
        } catch {
          setResult({
            outcome: err.status === 409 ? "duplicate" : "not_found",
            participant: null,
            registeredAt: null,
            message: err.message,
          });
        }
      } else {
        setResult({ outcome: "not_found", participant: null, registeredAt: null, message: "Scan failed. Try again." });
      }
    }
    // NOTE: busyRef stays true until the operator confirms the modal.
  }

  /** Dismiss the modal and resume scanning for the next QR. */
  function confirmResult() {
    setResult(null);
    busyRef.current = false;
  }

  async function start() {
    setCamError(null);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded: string) => handleDecode(decoded),
        () => {},
      );
      setScanning(true);
    } catch {
      setCamError("Couldn't access the camera. Grant permission and use HTTPS (or localhost).");
    }
  }

  async function stop() {
    const s = scannerRef.current;
    if (s) {
      try { await s.stop(); await s.clear(); } catch { /* ignore */ }
      scannerRef.current = null;
    }
    setScanning(false);
  }

  useEffect(() => () => { void stop(); }, []);

  const view = result ? OUTCOME[result.outcome] : null;

  return (
    <div style={{ maxWidth: 460, margin: "0 auto" }}>
      <Link href={`/dashboard/events/${id}`} className="small muted">← Back to event</Link>
      <h1 className="mt-8">Check-in scanner</h1>
      {event && <p className="muted mt-8">{event.name}</p>}

      <div className="card mt-16" style={{ padding: 16 }}>
        <div
          id="qr-reader"
          style={{ width: "100%", minHeight: 260, borderRadius: 12, overflow: "hidden", background: "var(--slate-100)" }}
        />
        {camError && <p className="small" style={{ color: "var(--danger)", marginTop: 10 }}>{camError}</p>}
        <div className="row gap-8 mt-16">
          {!scanning
            ? <button className="btn btn--primary btn--block" onClick={start}>Start camera</button>
            : <button className="btn btn--ghost btn--block" onClick={stop}>Stop camera</button>}
        </div>
      </div>

      <p className="muted small center mt-16">
        Point the camera at a participant's QR. Duplicate scans are flagged automatically.
      </p>

      {result && view && (
        <div className="scan-modal-overlay" role="dialog" aria-modal="true" aria-label={view.title}>
          <div className={`scan-modal scan-modal--${result.outcome}`}>
            <div className="scan-modal__badge">
              {view.kind === "success" ? <SuccessMark /> : <StaticGlyph kind={view.kind} />}
            </div>
            <div className="scan-modal__title">{view.title}</div>
            {result.participant && <div className="scan-modal__name">{result.participant.name}</div>}
            <p className="scan-modal__meta">{result.message}</p>
            {result.participant && (
              <p className="scan-modal__meta">{result.participant.email} · {result.participant.country}</p>
            )}
            {result.outcome === "duplicate" && result.registeredAt && (
              <p className="scan-modal__meta">First checked in: {new Date(result.registeredAt).toLocaleString()}</p>
            )}
            <button className="scan-modal__confirm" onClick={confirmResult} autoFocus>
              {result.outcome === "success" ? "Confirm & scan next" : "Got it, scan next"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}