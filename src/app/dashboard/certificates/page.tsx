"use client";

// ── Certificate email tool ────────────────────────────────────────────────────
// Drop a certificate image, draw the name box (or drag its two corner handles),
// save it in memory, then look up a participant by email and send them a branded
// email with their personalized certificate PDF attached.

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
import { CERTIFICATE_FONTS, loadAllFonts, loadFullFont, type CertificateFont } from "@/lib/certificateFonts";
import FontPicker from "@/components/FontPicker";
import "./certificate.css";

interface LookupResult {
  name: string;
  email: string;
}

type DragMode = "draw" | "tl" | "br" | null;

export default function CertificatesPage() {
  const toast = useToast();
  const me = useSession();

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [saved, setSaved] = useState(false);
  const [dragging, setDragging] = useState<DragMode>(null);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);

  const [email, setEmail] = useState("");
  const [lookedUp, setLookedUp] = useState<LookupResult | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [sending, setSending] = useState(false);
  const [font, setFont] = useState<CertificateFont>(CERTIFICATE_FONTS[0]);
  const [fontLoading, setFontLoading] = useState(false);
  const [fontReady, setFontReady] = useState(false);
  const [readyFonts, setReadyFonts] = useState<Set<string>>(new Set());

  const imgRef = useRef<HTMLImageElement>(null);
  const anchorRef = useRef<{ x: number; y: number } | null>(null);

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
      setSaved(false);
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

  // ── Coordinate math (image-pixel space via boundingClientRect) ─────────────
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

  // Start drawing a new box on the image (click + drag on the image itself).
  const onStagePointerDown = (e: React.PointerEvent) => {
    if (dragging) return;
    const m = imageMetrics();
    if (!m) return;
    const pt = clientToImage(e.clientX, e.clientY, m.rect, m);
    anchorRef.current = pt;
    setDragging("draw");
    setCoords(pt);
    setSaved(false);
  };

  // Start dragging a corner handle (the opposite corner stays fixed).
  const onHandlePointerDown = (which: "tl" | "br") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!box) return;
    const anchor = which === "tl"
      ? { x: box.x2, y: box.y2 }
      : { x: box.x1, y: box.y1 };
    anchorRef.current = anchor;
    setDragging(which);
    setSaved(false);
  };

  // Window-level move/up while dragging. This is robust regardless of pointer
  // capture: the box updates live, and measuring stops on mouse up.
  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      const m = imageMetrics();
      if (!m || !anchorRef.current) return;
      const pt = clientToImage(e.clientX, e.clientY, m.rect, m);
      setCoords(pt);
      setBox(normalizeBox(pt, anchorRef.current));
    };

    const onUp = () => {
      setDragging(null);
      setCoords(null);
      anchorRef.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging]);

  // ── Save (in-memory only) ──────────────────────────────────────────────────
  const saveBox = () => {
    if (!box) {
      toast.push("Draw the name box on the image first.", "err");
      return;
    }
    setSaved(true);
    toast.push("Name box saved for this session.", "ok");
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

  // ── Font selection ─────────────────────────────────────────────────────────
  // The selected font must be loaded in FULL (all glyphs) so the participant's
  // name renders correctly into the image. A text-restricted file would fall
  // back to a system font for any glyph outside the label.
  const selectFont = async (f: CertificateFont) => {
    setFont(f);
    setFontReady(false);
    setFontLoading(true);
    try {
      await loadFullFont(f);
      setFontReady(true);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Failed to load font.", "err");
      setFontReady(false);
    } finally {
      setFontLoading(false);
    }
  };

  // On mount: load the default font in FULL so the preview produces an image
  // immediately, and lazy-load the rest (text-restricted) so each dropdown
  // option renders in its own font as it becomes ready.
  useEffect(() => {
    let cancelled = false;
    const markReady = (family: string) => {
      if (!cancelled) setReadyFonts((prev) => new Set(prev).add(family));
    };
    // Load the default in full → preview works right away.
    loadFullFont(CERTIFICATE_FONTS[0])
      .then(() => {
        if (!cancelled) {
          setFontReady(true);
          markReady(CERTIFICATE_FONTS[0].family);
        }
      })
      .catch(() => {});
    // Then load the rest in the background (text-restricted, for the dropdown).
    loadAllFonts(markReady);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Send test ──────────────────────────────────────────────────────────────
  const sendTest = async () => {
    if (!image || !box) {
      toast.push("Load an image and define the name box first.", "err");
      return;
    }
    if (!saved) {
      toast.push("Save the name box first.", "err");
      return;
    }
    if (!lookedUp) {
      toast.push("Look up a participant by email first.", "err");
      return;
    }
    if (!fontReady) {
      toast.push("Wait for the font to finish loading.", "err");
      return;
    }
    setSending(true);
    try {
      const pdfBase64 = await buildCertificatePdf(image, lookedUp.name, box, `"${font.family}", serif`);
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
  // When no participant is looked up yet, render a sample name so the preview
  // produces an image immediately once the box is drawn and the font is ready.
  const previewName = lookedUp?.name ?? "Sample Name";
  const previewUrl = usePreview(image, previewName, box, fontReady ? `"${font.family}", serif` : null);

  const metrics = box ? boxMetrics(box) : null;

  // Cleanup object URL on unmount.
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  return (
    <div>
      <div className="row wrap gap-12" style={{ justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1>Certificates</h1>
          <p className="muted mt-8">
            Drop a certificate image, draw the name box, then send a personalized PDF by email.
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
              className="cert-stage"
              onPointerDown={onStagePointerDown}
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
                    onPointerDown={onHandlePointerDown("tl")}
                  />
                  <div
                    className="cert-handle cert-handle--br"
                    style={{ left: "100%", top: "100%" }}
                    onPointerDown={onHandlePointerDown("br")}
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
              <button className="btn btn--primary" onClick={saveBox} disabled={!box}>
                {saved ? "✓ Box saved" : "Save box"}
              </button>
              <button
                className="btn btn--ghost"
                onClick={() => {
                  setImage(null);
                  setImageUrl(null);
                  setBox(null);
                  setSaved(false);
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
                <>
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
                  {saved && (
                    <div className="cert-saved mt-8">
                      <span className="badge badge--ok">✓ Saved for this session</span>
                    </div>
                  )}
                </>
              ) : (
                <p className="muted small mt-8">Click and drag on the image to draw the name box.</p>
              )}
            </div>

            <div className="cert-panel">
              <div className="cert-panel__title">Font</div>
              <div className="field mt-8">
                <label htmlFor="cert-font">Name font</label>
                <FontPicker
                  value={font}
                  readyFonts={readyFonts}
                  loading={fontLoading}
                  onChange={selectFont}
                />
                <span className="hint">
                  {fontLoading ? "Loading font…" : fontReady ? `Using ${font.label}` : "Select a font"}
                </span>
              </div>
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
              disabled={sending || !lookedUp || !box || !saved || !fontReady}
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
function usePreview(
  image: HTMLImageElement | null,
  name: string,
  box: Box | null,
  fontFamily: string | null,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!image || !box || !name || !fontFamily) {
      setUrl(null);
      return;
    }
    const dataUrl = renderNameIntoImage(image, name, box, fontFamily);
    setUrl(dataUrl);
  }, [image, name, box, fontFamily]);
  return url;
}
