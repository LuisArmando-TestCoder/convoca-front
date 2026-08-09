"use client";

// ── Certificate email tool ────────────────────────────────────────────────────
// Drop a certificate image, draw the name box (or drag its two corner handles),
// save it in memory, then send personalized PDFs by email — to a single
// participant (test) or to a filtered/unfiltered set of participants.
// All tool state persists in sessionStorage, so switching dashboard tabs never
// loses your work.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

interface ListRow {
  name: string;
  email: string;
  eventName: string;
}

interface BulkFailure {
  name: string;
  email: string;
  reason: string;
}

interface BulkProgress {
  total: number;
  done: number;
  sent: number;
  failed: number;
  current: string | null;
}

interface SendRecord {
  id: string;
  at: string;
  name: string;
  email: string;
  font: string;
  box: Box;
  centerX: number;
  centerY: number;
  maxWidth: number;
  maxHeight: number;
  status: "sent" | "failed";
}

type DragMode = "draw" | "tl" | "br" | null;

const CERT_KEY = "convoca_cert_state_v1";
const MAX_BULK = 500;
const MAX_IMAGE_DIM = 1800;

interface CertSnapshot {
  imageDataUrl: string | null;
  box: Box | null;
  saved: boolean;
  fontFamily: string | null;
  email: string;
  lookedUp: LookupResult | null;
  selected: string[];
  search: string;
}

/** Downscale an image to a JPEG data URL (keeps sessionStorage small). */
function fileToDataUrl(file: File, maxDim = MAX_IMAGE_DIM): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

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
  // The box the preview is composited from. Only updated on mouse up, so the
  // expensive canvas render never runs mid-drag (which would block the loop).
  const [previewBox, setPreviewBox] = useState<Box | null>(null);

  const [email, setEmail] = useState("");
  const [lookedUp, setLookedUp] = useState<LookupResult | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [sending, setSending] = useState(false);

  const [font, setFont] = useState<CertificateFont>(CERTIFICATE_FONTS[0]);
  const [fontLoading, setFontLoading] = useState(false);
  const [fontReady, setFontReady] = useState(false);
  const [readyFonts, setReadyFonts] = useState<Set<string>>(new Set());

  // Bulk-send state.
  const [participants, setParticipants] = useState<ListRow[] | null>(null);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendingBulk, setSendingBulk] = useState(false);
  const [bulk, setBulk] = useState<BulkProgress | null>(null);
  const [bulkFailures, setBulkFailures] = useState<BulkFailure[]>([]);

  // Send log: every send is recorded with the font, box positions, center,
  // dimensions, and the recipient name/email it was sent to.
  const [sendLog, setSendLog] = useState<SendRecord[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const recordSend = useCallback((rec: Omit<SendRecord, "id" | "at">) => {
    const entry: SendRecord = {
      ...rec,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
    };
    setSendLog((prev) => [entry, ...prev]);
  }, []);

  const imgRef = useRef<HTMLImageElement>(null);
  const anchorRef = useRef<{ x: number; y: number } | null>(null);
  // Last pointer position in image coordinates, so the preview can be composited
  // from the final box on mouse up (React state may not have flushed yet).
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);
  const fontRef = useRef(font);
  useEffect(() => { fontRef.current = font; }, [font]);

  // ── Image loading ──────────────────────────────────────────────────────────
  const loadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.push("Please drop an image file.", "err");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      const img = new Image();
      img.onload = () => {
        setImage(img);
        setImageUrl(dataUrl);
        setBox(null);
        setSaved(false);
        setLookedUp(null);
        setSelected(new Set());
        setSearch("");
        setBulk(null);
        setBulkFailures([]);
      };
      img.src = dataUrl;
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not read that image.", "err");
    }
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
      lastPtRef.current = pt;
      setCoords(pt);
      setBox(normalizeBox(pt, anchorRef.current));
    };

    const onUp = () => {
      // Capture the anchor and last pointer position before clearing them, so
      // the preview can be composited from the final box once the drag ends
      // (never mid-drag).
      const anchor = anchorRef.current;
      const pt = lastPtRef.current;
      setDragging(null);
      setCoords(null);
      anchorRef.current = null;
      lastPtRef.current = null;
      if (anchor && pt) {
        setPreviewBox(normalizeBox(pt, anchor));
      }
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
    setPreviewBox(box);
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
    loadFullFont(CERTIFICATE_FONTS[0])
      .then(() => {
        if (!cancelled) {
          markReady(CERTIFICATE_FONTS[0].family);
          if (fontRef.current === CERTIFICATE_FONTS[0]) setFontReady(true);
        }
      })
      .catch(() => {});
    loadAllFonts(markReady);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persistence (survives tab changes) ─────────────────────────────────────
  // Restore the last session's snapshot on mount.
  useEffect(() => {
    let cancelled = false;
    try {
      const raw = sessionStorage.getItem(CERT_KEY);
      if (!raw) return;
      const snap = JSON.parse(raw) as CertSnapshot;
      if (snap.imageDataUrl) {
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          setImage(img);
          setImageUrl(snap.imageDataUrl!);
          setBox(snap.box ?? null);
          setSaved(Boolean(snap.saved));
          setEmail(snap.email ?? "");
          setLookedUp(snap.lookedUp ?? null);
          setSelected(new Set(snap.selected ?? []));
          setSearch(snap.search ?? "");
          if (snap.fontFamily) {
            const f = CERTIFICATE_FONTS.find((x) => x.family === snap.fontFamily);
            if (f) {
              setFont(f);
              // Load the restored font in full so the preview renders correctly.
              loadFullFont(f).then(() => {
                if (!cancelled) setFontReady(true);
              }).catch(() => {});
            }
          }
        };
        img.src = snap.imageDataUrl;
      }
    } catch {
      // Corrupt state — start fresh.
    }
    return () => { cancelled = true; };
  }, []);

  // Persist the snapshot whenever any piece of tool state changes.
  useEffect(() => {
    const snap: CertSnapshot = {
      imageDataUrl: imageUrl,
      box,
      saved,
      fontFamily: font.family,
      email,
      lookedUp,
      selected: Array.from(selected),
      search,
    };
    try {
      sessionStorage.setItem(CERT_KEY, JSON.stringify(snap));
    } catch {
      // Quota exceeded — the image is probably too large; skip persisting.
    }
  }, [imageUrl, box, saved, font, email, lookedUp, selected, search]);

  // ── Participant list (bulk) ────────────────────────────────────────────────
  const loadParticipants = useCallback(async () => {
    setLoadingParticipants(true);
    try {
      const res = await api<{ participants: ListRow[] }>("/api/participants/list");
      setParticipants(res.participants);
      toast.push(`${res.participants.length} participants loaded.`, "ok");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed to load participants.", "err");
    } finally {
      setLoadingParticipants(false);
    }
  }, [toast]);

  const filtered = useMemo(() => {
    if (!participants) return [];
    const q = search.trim().toLowerCase();
    if (!q) return participants;
    return participants.filter(
      (p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
    );
  }, [participants, search]);

  const toggleSelect = (email: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of filtered) next.add(p.email);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  // ── Bulk send ──────────────────────────────────────────────────────────────
  const sendBulk = async () => {
    if (!image || !box) {
      toast.push("Load an image and define the name box first.", "err");
      return;
    }
    if (!saved) {
      toast.push("Save the name box first.", "err");
      return;
    }
    if (!fontReady) {
      toast.push("Wait for the font to finish loading.", "err");
      return;
    }
    const targets = participants?.filter((p) => selected.has(p.email)) ?? [];
    if (targets.length === 0) {
      toast.push("Select at least one participant.", "err");
      return;
    }
    if (targets.length > MAX_BULK) {
      toast.push(`Maximum ${MAX_BULK} recipients per run. Refine your filter.`, "err");
      return;
    }

    setSendingBulk(true);
    setBulkFailures([]);
    setBulk({ total: targets.length, done: 0, sent: 0, failed: 0, current: targets[0].name });
    const failures: BulkFailure[] = [];

    for (let i = 0; i < targets.length; i++) {
      const p = targets[i];
      setBulk((b) => (b ? { ...b, current: p.name, done: i } : b));
      const m = boxMetrics(box);
      try {
        const pdfBase64 = await buildCertificatePdf(image, p.name, box, `"${font.family}", serif`);
        await api("/api/certificates/send", {
          method: "POST",
          body: { to: p.email, name: p.name, pdfBase64 },
        });
        recordSend({
          name: p.name,
          email: p.email,
          font: font.label,
          box,
          centerX: m.centerX,
          centerY: m.centerY,
          maxWidth: m.maxWidth,
          maxHeight: m.maxHeight,
          status: "sent",
        });
        setBulk((b) => (b ? { ...b, sent: b.sent + 1, done: i + 1 } : b));
      } catch (err) {
        failures.push({ name: p.name, email: p.email, reason: err instanceof Error ? err.message : "Send failed" });
        recordSend({
          name: p.name,
          email: p.email,
          font: font.label,
          box,
          centerX: m.centerX,
          centerY: m.centerY,
          maxWidth: m.maxWidth,
          maxHeight: m.maxHeight,
          status: "failed",
        });
        setBulk((b) => (b ? { ...b, failed: b.failed + 1, done: i + 1 } : b));
      }
      // Gentle throttle between sends to respect Gmail's burst limits.
      if (i < targets.length - 1) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    setBulkFailures(failures);
    setBulk((b) => (b ? { ...b, current: null } : b));
    setSendingBulk(false);
    const ok = targets.length - failures.length;
    toast.push(
      failures.length === 0
        ? `Sent ${ok} certificate${ok === 1 ? "" : "s"}.`
        : `Sent ${ok} of ${targets.length}; ${failures.length} failed.`,
      failures.length === 0 ? "ok" : "err",
    );
  };

  // ── Send test (single) ─────────────────────────────────────────────────────
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
    const m = boxMetrics(box);
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
      recordSend({
        name: lookedUp.name,
        email: lookedUp.email,
        font: font.label,
        box,
        centerX: m.centerX,
        centerY: m.centerY,
        maxWidth: m.maxWidth,
        maxHeight: m.maxHeight,
        status: "sent",
      });
      toast.push(`Certificate sent to ${lookedUp.email}.`, "ok");
    } catch (err) {
      recordSend({
        name: lookedUp.name,
        email: lookedUp.email,
        font: font.label,
        box,
        centerX: m.centerX,
        centerY: m.centerY,
        maxWidth: m.maxWidth,
        maxHeight: m.maxHeight,
        status: "failed",
      });
      toast.push(err instanceof ApiError ? err.message : "Send failed.", "err");
    } finally {
      setSending(false);
    }
  };

  // ── Preview (name composited into the box) ─────────────────────────────────
  // When no participant is looked up yet, render a sample name so the preview
  // produces an image immediately once the box is drawn and the font is ready.
  const previewName = lookedUp?.name ?? "Sample Name";
  // The preview composites from `previewBox` (only updated on mouse up / save),
  // never from `box` (which changes on every pointermove during a drag).
  const previewUrl = usePreview(image, previewName, previewBox, fontReady ? `"${font.family}", serif` : null);

  const metrics = box ? boxMetrics(box) : null;

  // Cleanup object URL on unmount (only for blob: URLs — data URLs are no-ops).
  useEffect(() => () => { if (imageUrl?.startsWith("blob:")) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  return (
    <div>
      <div className="row wrap gap-12" style={{ justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1>Certificates</h1>
          <p className="muted mt-8">
            Drop a certificate image, draw the name box, then send personalized PDFs by email.
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
                  setSelected(new Set());
                  setSearch("");
                  setBulk(null);
                  setBulkFailures([]);
                }}
              >
                Change image
              </button>
            </div>
          </div>

          {/* Side panel: metrics + lookup + bulk + send */}
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

            <div className="cert-panel">
              <div className="cert-panel__title">Bulk send</div>
              <div className="field mt-8">
                <label htmlFor="cert-filter">Filter participants</label>
                <input
                  id="cert-filter"
                  className="input"
                  type="text"
                  placeholder="Search name or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button
                className="btn btn--ghost btn--block"
                onClick={loadParticipants}
                disabled={loadingParticipants}
              >
                {loadingParticipants ? <span className="spinner spinner--dark" /> : participants ? "Refresh list" : "Load participants"}
              </button>

              {participants && (
                <>
                  <div className="cert-bulk__list">
                    {filtered.slice(0, 300).map((p) => (
                      <label key={p.email} className="cert-bulk__row">
                        <input
                          type="checkbox"
                          className="cert-bulk__check"
                          checked={selected.has(p.email)}
                          onChange={() => toggleSelect(p.email)}
                        />
                        <span className="cert-bulk__name">{p.name}</span>
                        <span className="cert-bulk__email">{p.email}</span>
                      </label>
                    ))}
                    {filtered.length === 0 && (
                      <p className="muted small" style={{ padding: "10px 4px" }}>No participants match.</p>
                    )}
                    {filtered.length > 300 && (
                      <p className="muted small" style={{ padding: "10px 4px" }}>
                        Showing first 300 of {filtered.length}. Refine your filter to narrow down.
                      </p>
                    )}
                  </div>

                  <div className="cert-bulk__actions">
                    <button className="btn btn--ghost btn--sm" onClick={selectAllFiltered}>
                      Select all ({filtered.length})
                    </button>
                    <button className="btn btn--ghost btn--sm" onClick={clearSelection}>
                      Clear
                    </button>
                    <span className="cert-bulk__count">{selected.size} selected</span>
                  </div>

                  <button
                    className="btn btn--primary btn--block cert-send"
                    onClick={sendBulk}
                    disabled={sendingBulk || selected.size === 0 || !box || !saved || !fontReady}
                  >
                    {sendingBulk
                      ? <span className="spinner" />
                      : `Send ${selected.size} certificate${selected.size === 1 ? "" : "s"}`}
                  </button>

                  {bulk && (
                    <div className="cert-bulk__progress">
                      <div className="cert-bulk__bar">
                        <div
                          className="cert-bulk__bar-fill"
                          style={{ width: `${bulk.total ? (bulk.done / bulk.total) * 100 : 0}%` }}
                        />
                      </div>
                      <div className="cert-bulk__meta">
                        {bulk.done} / {bulk.total} · {bulk.sent} sent · {bulk.failed} failed
                        {bulk.current && <span className="cert-bulk__current"> · {bulk.current}</span>}
                      </div>
                    </div>
                  )}

                  {bulkFailures.length > 0 && (
                    <div className="cert-bulk__failures">
                      {bulkFailures.map((f) => (
                        <div key={f.email} className="cert-bulk__failure">
                          <strong>{f.name}</strong> — {f.reason}
                        </div>
                      ))}
                    </div>
                  )}
                </>
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

      {/* Send log: every send recorded with font, box positions, center,
          dimensions, and the recipient name/email it was sent to. */}
      <div className="cert-log">
        <div className="cert-log__head">
          <div>
            <h2>Send log</h2>
            <p className="muted small">
              {sendLog.length} send{sendLog.length === 1 ? "" : "s"} recorded · font, box, center, dimensions, recipient
            </p>
          </div>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setLogOpen((o) => !o)}
            disabled={sendLog.length === 0}
          >
            {logOpen ? "Hide" : "Show"}
          </button>
        </div>

        {logOpen && sendLog.length > 0 && (
          <div className="cert-log__table-wrap">
            <table className="cert-log__table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Recipient</th>
                  <th>Font</th>
                  <th>Box (x1,y1 → x2,y2)</th>
                  <th>Center</th>
                  <th>Max W × H</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sendLog.map((r) => (
                  <tr key={r.id}>
                    <td className="cert-log__mono">{new Date(r.at).toLocaleString()}</td>
                    <td>
                      <div className="cert-log__name">{r.name}</div>
                      <div className="cert-log__email">{r.email}</div>
                    </td>
                    <td>{r.font}</td>
                    <td className="cert-log__mono">
                      ({Math.round(r.box.x1)}, {Math.round(r.box.y1)}) → ({Math.round(r.box.x2)}, {Math.round(r.box.y2)})
                    </td>
                    <td className="cert-log__mono">
                      ({Math.round(r.centerX)}, {Math.round(r.centerY)})
                    </td>
                    <td className="cert-log__mono">
                      {Math.round(r.maxWidth)} × {Math.round(r.maxHeight)}
                    </td>
                    <td>
                      <span className={`badge ${r.status === "sent" ? "badge--ok" : "badge--err"}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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