"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { CheckinResult, EventDoc } from "@/lib/types";


const ICON: Record<CheckinResult["outcome"], string> = {
  success: "✅",
  duplicate: "⚠️",
  not_found: "⛔",
  wrong_event: "⛔",
};

export default function ScanPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventDoc | null>(null);

  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [camError, setCamError] = useState<string | null>(null);

  const scannerRef = useRef<any>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const busyRef = useRef(false);

  useEffect(() => {
    api<{ event: EventDoc }>(`/api/events/${id}`).then((r) => setEvent(r.event)).catch(() => {});
  }, [id]);

  async function handleDecode(text: string) {
    const code = text.trim().toLowerCase();
    const now = Date.now();
    // Debounce: ignore the same code re-read within 3s, or while a request is in flight.
    if (busyRef.current) return;
    if (code === lastRef.current.code && now - lastRef.current.at < 3000) return;
    lastRef.current = { code, at: now };
    busyRef.current = true;
    try {
      const res = await api<CheckinResult>(`/api/events/${id}/checkin`, { method: "POST", body: { hash: code } });
      setResult(res);
    } catch (err) {
      if (err instanceof ApiError) {
        // 409 (duplicate) / 404 (not found) still carry the structured result.
        try {
          setResult(JSON.parse((err as any).message));
        } catch {
          setResult({ outcome: err.status === 409 ? "duplicate" : "not_found", participant: null, registeredAt: null, message: err.message });
        }
      }
    } finally {
      setTimeout(() => (busyRef.current = false), 900);
    }
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
    } catch (err) {
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

      {result && (
        <div className={`scan-result scan-result--${result.outcome} mt-16`}>
          <div className="scan-result__icon">{ICON[result.outcome]}</div>
          {result.participant && <div className="scan-result__name">{result.participant.name}</div>}
          <p style={{ margin: "6px 0 0", fontWeight: 600 }}>{result.message}</p>
          {result.participant && <p className="muted small">{result.participant.email} · {result.participant.country}</p>}
          {result.outcome === "duplicate" && result.registeredAt && (
            <p className="muted small">First checked in: {new Date(result.registeredAt).toLocaleString()}</p>
          )}
        </div>
      )}

      <p className="muted small center mt-16">
        Point the camera at a participant&apos;s QR. Duplicate scans are flagged automatically.
      </p>
    </div>
  );
}
