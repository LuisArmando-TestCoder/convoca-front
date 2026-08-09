"use client";

// ── Certificate email tool ────────────────────────────────────────────────────
// Drop a certificate image, drag the top-left + bottom-right corners to define
// the name box (coordinates in image pixels), save it in memory, then look up a
// participant by email and send them a branded email with their personalized
// certificate PDF attached.

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { useSession } from "@/components/session";
import {
  boxMetrics,
  clientToImage,
  normalizeBox,
  type Box,
} from "@/lib/certificate";
import { buildCertificatePdf, renderNameIntoImage } from "@/lib/certificatePdf";
import "./certificate.css";

interface LookupResult {
  name: string;
  email: string;
}

export default function CertificatesPage() {
  const toast = useToast();
  const me = useSession();

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [dragging, setDragging] = useState<"tl" | "br" | null>(null);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);

  const [email, setEmail] = useState("");
  const [lookedUp, setLookedUp] = useState<LookupResult | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [sending, setSending] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // ── Image loading ──────────────────────────────────────────────────────────
  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.push("Please drop an image file.", "err");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setImageUrl(url);
      setBox(null);
      setLookedUp(null);
    };
    img.src = url;
  }, [toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  }, [loadFile]);

  // ── Box dragging (image-pixel coords via boundingClientRect) ───────────────
  const imageMetrics = () => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    return {
      displayWidth: rect.width,
      displayHeight: rect.height,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      rect,
    };
  };

  const onPointerDown = (which: "tl" | "br") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(which);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const m = imageMetrics();
    if (!m) return;
    const pt = clientToImage(e.clientX, e.clientY, m.rect, m);
    setCoords(pt);

    if (!dragging) return;
    const other = dragging === "tl" ? box?.x2 ?? 0 : box?.x1 ?? 0;
    const otherY = dragging === "tl" ? box?.y2 ?? 0 : box?.y1 ?? 0;
    const next = normalizeBox(
      { x: pt.x, y: pt.y },
      { x: other, y: otherY },
    );
    setBox(next);
  };

  const onPointerUp = () => setDragging(null);

  // ── Save (in-memory only) ──────────────────────────────────────────────────
  const saveBox = () => {
    if (!box) {
      toast.push("Drag the two corners to define the name box first.", "err");
      return;
    }
    toast.push("Box saved for this session.", "ok");
  };

  // ── Participant lookup by email ────────────────────────────────────────────
  const lookup = async () => {
    if (!email.trim()) {
      toast.push("Enter a recipient email first.", "err");
      return;
    }
    setLookingUp(true);
    setLookedUp(null);
    try {
      const res = await api<LookupResult>(
        `/api/participants/lookup?email=${encodeURIComponent(email.trim())}`,
      );
      setLookedUp(res);
      toast.push(`Found ${res.name}.`, "ok");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Lookup failed.", "err");
    } finally {
      setLookingUp(false);
    }
  };

  // ── Send test ──────────────────────────────────────────────────────────────
  const sendTest = async () => {
    if (!image || !box) {
      toast.push("Load an image and define the name box first.", "err");
      return;
    }
    if (!lookedUp) {
      toast.push("Look up a participant by email first.", "err");
      return;
    }
    setSending(true);
    try {
      const pdfBase64 = await buildCertificatePdf(image, lookedUp.name, box);
      await api("/api/certificates/send", {
        method: "POST",
        body: {
          to: lookedUp.email,
          name: lookedUp.name,
          pdfBase64,
        },
      });
      toast.push(`Certificate sent to ${lookedUp.email}.`, "ok");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Send failed.", "err");
    } finally {
      setSending(false);
    }
  };

  // ── Preview (name composited into the box) ─────────────────────────────────
  const previewUrl = useMemoPreview(image, lookedUp?.name ?? "", box);

  const metrics = box ? boxMetrics(box) : null;

  // Cleanup object URL on unmount.
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  return (
    <div>
      <div className="row wrap gap-12" style={{ justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1>Certificates</h1>
          <p className="muted mt-8">
            Drop a certificate image, define the name box, then send a personalized PDF by email.
          </p>
        </div>
      </div>

      {!image ? (
        <div
          className={`dropzone ${dragOver ? "dropzone--over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => document.getElementById("cert-file")?.click()}
        >
          <div className="dropzone__icon">🖼️</div>
          <strong>Drop your certificate image here</strong>
          <span className="dropzone__hint">or click to browse · PNG or JPG</span>
          <input
            id="cert-file"
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }}
          />
        </div>
      ) : (
        <div className="cert-editor">
          {/* Stage: image + draggable box */}
          <div className="cert-stage-card">
            <div
              ref={stageRef}
              className="cert-stage"
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              <img
                ref={imgRef}
                src={imageUrl!}
                alt="Certificate"
                draggable={false}
              />
              {box && (
                <div
                  className="cert-box"
                  style={{
                    left: `${(box.x1 / image.naturalWidth) * 100}%`,
                    top: `${(box.y1 / image.naturalHeight) * 100}%`,
                    width: `${((box.x2 - box.x1) / image.naturalWidth) * 100}%`,
                    height: `${((box.y2 - box.y1) / image.naturalHeight) * 100}%`,
                  }}
                >
                  <div
                    className="cert-handle cert-handle--tl"
                    onPointerDown={onPointerDown("tl")}
                  />
                  <div
                    className="cert-handle cert-handle--br"
                    style={{ left: "100%", top: "100%" }}
                    onPointerDown={onPointerDown("br")}
                  />
                </div>
              )}
              {coords && (
                <div className="cert-coords">
                  {`x: ${Math.round(coords.x)}  y: ${Math.round(coords.y)}`}
                </div>
              )}
            </div>

            <div className="row gap-8 mt-16 wrap">
              <button className="btn btn--primary" onClick={saveBox}>Save box</button>
              <button
                className="btn btn--ghost"
                onClick={() => {
                  setImage(null);
                  setImageUrl(null);
                  setBox(null);
                  setLookedUp(null);
                }}
              >
                Change image
              </button>
            </div>
          </div>

          {/* Side panel: metrics + lookup + send */}
          <div className="cert-side">
            <div className="cert-panel">
              <div className="cert-panel__title">Name box</div>
              {metrics ? (
                <div className="cert-metrics mt-8">
                  <div className="cert-metric">
                    <div className="cert-metric__label">Top-left</div>
                    <div className="cert-metric__value">({Math.round(box!.x1)}, {Math.round(box!.y1)})</div>
                  </div>
                  <div className="cert-metric">
                    <div className="cert-metric__label">Bottom-right</div>
                    <div className="cert-metric__value">({Math.round(box!.x2)}, {Math.round(box!.y2)})</div>
                  </div>
                  <div className="cert-metric">
                    <div className="cert-metric__label">Center</div>
                    <div className="cert-metric__value">({Math.round(metrics.centerX)}, {Math.round(metrics.centerY)})</div>
                  </div>
                  <div className="cert-metric">
                    <div className="cert-metric__label">Max W × H</div>
                    <div className="cert-metric__value">{Math.round(metrics.maxWidth)} × {Math.round(metrics.maxHeight)}</div>
                  </div>
                </div>
              ) : (
                <p className="muted small mt-8">Drag the two corner handles to define the name box.</p>
              )}
            </div>

            <div className="cert-panel">
              <div className="cert-panel__title">Recipient</div>
              <div className="field mt-8">
                <label htmlFor="cert-email">Participant email</label>
                <input
                  id="cert-email"
                  className="input"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setLookedUp(null); }}
                />
              </div>
              <button className="btn btn--ghost btn--block" onClick={lookup} disabled={lookingUp}>
                {lookingUp ? <span className="spinner spinner--dark" /> : "Look up name"}
              </button>
              {lookedUp && (
                <div className="cert-found mt-8">
                  <div className="cert-found__name">{lookedUp.name}</div>
                  <div className="cert-found__email">{lookedUp.email}</div>
                </div>
              )}
            </div>

            {previewUrl && (
              <div className="cert-panel">
                <div className="cert-panel__title">Preview</div>
                <div className="cert-preview mt-8">
                  <img src={previewUrl} alt="Certificate preview" />
                </div>
              </div>
            )}

            <button
              className="btn btn--primary btn--block cert-send"
              onClick={sendTest}
              disabled={sending || !lookedUp || !box}
            >
              {sending ? <span className="spinner" /> : "Send test email"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Memoized preview: composite the looked-up name into the box. */
function useMemoPreview(image: HTMLImageElement | null, name: string, box: Box | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!image || !box || !name) {
      setUrl(null);
      return;
    }
    const dataUrl = renderNameIntoImage(image, name, box);
    setUrl(dataUrl);
  }, [image, name, box]);
  return url;
}