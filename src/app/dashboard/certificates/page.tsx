"use client";

// ── Certificate email tool ────────────────────────────────────────────────────
// Drop a certificate image, draw the name box (or drag its two corner handles),
// and see the name rendered live inside the box ON the image (true WYSIWYG).
// Send a personalized test probe to any custom name/email, or bulk-send PDFs to
// participants of a selected event. The participant list is fetched per event
// and the filtered results are paginated. All tool state persists in
// sessionStorage, so switching dashboard tabs never loses your work. The box
// overlay sits at a higher z-index than the composited name so it always stays
// above the preview.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import {
  boxMetrics,
  clientToImage,
  fitTextInBox,
  normalizeBox,
  type Box,
} from "@/lib/certificate";
import { buildCertificatePdf } from "@/lib/certificatePdf";
import { CERTIFICATE_FONTS, loadAllFonts, loadFullFont, type CertificateFont } from "@/lib/certificateFonts";
import FontPicker from "@/components/FontPicker";
import "./certificate.css";

interface ListRow {
  name: string;
  email: string;
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
const MAX_IMAGE_DIM = 1800;
const FIT_WEIGHT = 700;
const FIT_COLOR = "#0b1220"; // ink — must match the PDF builder

interface CertSnapshot {
  imageDataUrl: string | null;
  box: Box | null;
  saved: boolean;
  fontFamily: string | null;
  probeName: string;
  probeEmail: string;
  selected: string[];
  search: string;
  pageSize: number;
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

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [saved, setSaved] = useState(false);
  const [dragging, setDragging] = useState<DragMode>(null);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);

  // Test probe: an ephemeral recipient that drives the preview + a single test
  // send — no participant lookup required.
  const [probeName, setProbeName] = useState("");
  const [probeEmail, setProbeEmail] = useState("");
  const [sendingProbe, setSendingProbe] = useState(false);

  const [font, setFont] = useState<CertificateFont>(CERTIFICATE_FONTS[0]);
  const [fontLoading, setFontLoading] = useState(false);
  const [fontReady, setFontReady] = useState(false);
  const [readyFonts, setReadyFonts] = useState<Set<string>>(new Set());

  // Bulk-send state. Participants are scoped to the selected event, so the tool
  // only ever emits certificates for the event you pick.
  const [events, setEvents] = useState<{ id: string; name: string }[] | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ListRow[] | null>(null);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<ListRow | null>(null);
  const [sendingBulk, setSendingBulk] = useState(false);
  const [bulk, setBulk] = useState<BulkProgress | null>(null);
  const [bulkFailures, setBulkFailures] = useState<BulkFailure[]>([]);

  // Pagination: the filtered list is paginated when it exceeds an editable
  // amount (defaults to 50 rows per page).
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Send log: every send is recorded with the font, box positions, center,
  // dimensions, and the recipient name/email it was sent to.
  const [sendLog, setSendLog] = useState<SendRecord[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  // Record a send locally AND persist it to the org's send log in Firestore.
  // The DB write is fire-and-forget so it never blocks the send loop; the local
  // row updates immediately so the table feels instant.
  const recordSend = useCallback((rec: Omit<SendRecord, "id" | "at">) => {
    const entry: SendRecord = {
      ...rec,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
    };
    setSendLog((prev) => [entry, ...prev]);
    api("/api/certificates/log", {
      method: "POST",
      body: {
        name: rec.name,
        email: rec.email,
        font: rec.font,
        box: rec.box,
        centerX: rec.centerX,
        centerY: rec.centerY,
        maxWidth: rec.maxWidth,
        maxHeight: rec.maxHeight,
        status: rec.status,
      },
    }).catch(() => {
      // Persistence is best-effort; the local row already reflects the send.
    });
  }, []);

  // Load the org's persisted send history on mount.
  useEffect(() => {
    let cancelled = false;
    api<{ sends: SendRecord[] }>("/api/certificates/log")
      .then((res) => {
        if (!cancelled) setSendLog(res.sends);
      })
      .catch(() => {
        // Log is best-effort; the page still works without it.
      });
    return () => { cancelled = true; };
  }, []);

  const stageCanvasRef = useRef<HTMLCanvasElement>(null);
  const anchorRef = useRef<{ x: number; y: number } | null>(null);
  // Last pointer position in image coordinates, so the box can be finalized from
  // the last pointermove when the pointer is released outside the window.
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
        setProbeName("");
        setProbeEmail("");
        setHovered(null);
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

  // ── Coordinate math (image-pixel space via the WYSIWYG canvas element) ─────
  const imageMetrics = () => {
    const canvas = stageCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      displayWidth: rect.width,
      displayHeight: rect.height,
      naturalWidth: canvas.width,
      naturalHeight: canvas.height,
      rect,
    };
  };

  // Start drawing a new box on the image (click + drag on the canvas itself).
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

  // Window-level move/up while dragging. The box updates live and the WYSIWYG
  // redraws the name on every move, so the name visibly re-fits inside the box
  // while you drag it.
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
      const anchor = anchorRef.current;
      const pt = lastPtRef.current;
      setDragging(null);
      setCoords(null);
      anchorRef.current = null;
      lastPtRef.current = null;
      if (anchor && pt) {
        setBox(normalizeBox(pt, anchor));
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
    toast.push("Name box saved for this session.", "ok");
  };

  // ── Font selection ─────────────────────────────────────────────────────────
  // The selected font must be loaded in FULL (all glyphs) so the participant's
  // name renders correctly into the canvas/PDF. A text-restricted file would
  // fall back to a system font for any glyph outside the label.
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

  // On mount: load the default font in FULL so the preview produces text
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
          setProbeName(snap.probeName ?? "");
          setProbeEmail(snap.probeEmail ?? "");
          setSelected(new Set(snap.selected ?? []));
          setSearch(snap.search ?? "");
          if (snap.pageSize) setPageSize(snap.pageSize);
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
      probeName,
      probeEmail,
      selected: Array.from(selected),
      search,
      pageSize,
    };
    try {
      sessionStorage.setItem(CERT_KEY, JSON.stringify(snap));
    } catch {
      // Quota exceeded — the image is probably too large; skip persisting.
    }
  }, [imageUrl, box, saved, font, probeName, probeEmail, selected, search, pageSize]);

  // ── Events + participant list (bulk) ───────────────────────────────────────
  // Load the org's events so the user can pick which event to emit certificates
  // for. Participants are then scoped to that event via the existing, deployed
  // /api/events/:id/participants endpoint.
  const loadParticipantsForEvent = useCallback(async (eventId: string) => {
    setLoadingParticipants(true);
    try {
      const res = await api<{ participants: { name: string; email: string }[] }>(
        `/api/events/${eventId}/participants`,
      );
      const rows: ListRow[] = res.participants.map((p) => ({
        name: p.name,
        email: p.email,
      }));
      setParticipants(rows);
      toast.push(`${rows.length} participants loaded.`, "ok");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed to load participants.", "err");
    } finally {
      setLoadingParticipants(false);
    }
  }, [toast]);

  const loadEvents = useCallback(async () => {
    try {
      const res = await api<{ events: { id: string; name: string }[] }>("/api/events");
      setEvents(res.events);
      if (res.events.length > 0) {
        const first = res.events[0].id;
        setSelectedEventId(first);
        await loadParticipantsForEvent(first);
      } else {
        setSelectedEventId(null);
        setParticipants([]);
      }
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed to load events.", "err");
    }
  }, [loadParticipantsForEvent, toast]);

  const selectEvent = async (eventId: string) => {
    setSelectedEventId(eventId);
    setSelected(new Set());
    setSearch("");
    setPage(1);
    await loadParticipantsForEvent(eventId);
  };

  // Load events on mount so the selector is populated.
  useEffect(() => {
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Filtering + pagination (filters live BEFORE the list) ──────────────────
  const filtered = useMemo(() => {
    if (!participants) return [];
    const q = search.trim().toLowerCase();
    if (!q) return participants;
    return participants.filter(
      (p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
    );
  }, [participants, search]);

  // Reset to page 1 whenever the filter inputs change.
  useEffect(() => { setPage(1); }, [search, pageSize, selectedEventId, participants]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / Math.max(1, pageSize)));
  const pageRows = useMemo(() => {
    const size = Math.max(1, pageSize);
    return filtered.slice((page - 1) * size, page * size);
  }, [filtered, page, pageSize]);
  const pageStart = filtered.length === 0 ? 0 : (page - 1) * Math.max(1, pageSize) + 1;
  const pageEnd = Math.min(filtered.length, page * Math.max(1, pageSize));

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

  // "No filter" select-all: selects every participant, ignoring the search box.
  const selectAllNoFilter = () => {
    if (!participants) return;
    setSelected(new Set(participants.map((p) => p.email)));
  };

  const clearSelection = () => setSelected(new Set());

  // ── WYSIWYG stage: composite the preview name into the box ON the canvas ───
  // Preview priority: hovered participant > test probe name > sample.
  const stagePreviewName = hovered?.name ?? (probeName.trim() || "Sample Name");

  const redrawStage = useCallback(() => {
    const canvas = stageCanvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (canvas.width !== image.naturalWidth) canvas.width = image.naturalWidth;
    if (canvas.height !== image.naturalHeight) canvas.height = image.naturalHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    if (box && fontReady && stagePreviewName.trim()) {
      const family = `"${font.family}", serif`;
      const fit = fitTextInBox(ctx, stagePreviewName.trim(), box, family, FIT_WEIGHT);
      if (fit.fontSize > 0) {
        ctx.font = `${FIT_WEIGHT} ${fit.fontSize}px ${family}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = FIT_COLOR;
        ctx.fillText(stagePreviewName.trim(), fit.textX, fit.baselineY);
      }
    }
  }, [image, box, fontReady, stagePreviewName, font]);

  // Redraw live: on image load, on every box change (including during drag),
  // on name change, and when the font finishes loading.
  useEffect(() => { redrawStage(); }, [redrawStage]);

  // ── Send helpers (shared by probe + bulk) ──────────────────────────────────
  const requireReady = () => {
    if (!image || !box) {
      toast.push("Load an image and define the name box first.", "err");
      return false;
    }
    if (!saved) {
      toast.push("Save the name box first.", "err");
      return false;
    }
    if (!fontReady) {
      toast.push("Wait for the font to finish loading.", "err");
      return false;
    }
    return true;
  };

  const sendOne = async (name: string, email: string) => {
    const m = boxMetrics(box!);
    try {
      const pdfBase64 = await buildCertificatePdf(image!, name, box!, `"${font.family}", serif`);
      await api("/api/certificates/send", {
        method: "POST",
        body: { to: email, name, pdfBase64 },
      });
      recordSend({
        name,
        email,
        font: font.label,
        box: box!,
        centerX: m.centerX,
        centerY: m.centerY,
        maxWidth: m.maxWidth,
        maxHeight: m.maxHeight,
        status: "sent",
      });
      return { ok: true as const };
    } catch (err) {
      recordSend({
        name,
        email,
        font: font.label,
        box: box!,
        centerX: m.centerX,
        centerY: m.centerY,
        maxWidth: m.maxWidth,
        maxHeight: m.maxHeight,
        status: "failed",
      });
      return { ok: false as const, reason: err instanceof Error ? err.message : "Send failed" };
    }
  };

  // ── Send test probe (custom name + email, no lookup required) ──────────────
  const sendProbe = async () => {
    const name = probeName.trim();
    const email = probeEmail.trim().toLowerCase();
    if (!name || !email) {
      toast.push("Enter a probe name and email first.", "err");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.push("That email doesn't look right.", "err");
      return;
    }
    if (!requireReady()) return;
    setSendingProbe(true);
    const res = await sendOne(name, email);
    toast.push(
      res.ok ? `Probe sent to ${email}.` : res.reason,
      res.ok ? "ok" : "err",
    );
    setSendingProbe(false);
  };

  // ── Bulk send ──────────────────────────────────────────────────────────────
  const sendBulk = async () => {
    if (!requireReady()) return;
    const targets = participants?.filter((p) => selected.has(p.email)) ?? [];
    if (targets.length === 0) {
      toast.push("Select at least one participant.", "err");
      return;
    }

    setSendingBulk(true);
    setBulkFailures([]);
    setBulk({ total: targets.length, done: 0, sent: 0, failed: 0, current: targets[0].name });
    const failures: BulkFailure[] = [];

    for (let i = 0; i < targets.length; i++) {
      const p = targets[i];
      setBulk((b) => (b ? { ...b, current: p.name, done: i } : b));
      const res = await sendOne(p.name, p.email);
      if (res.ok) {
        setBulk((b) => (b ? { ...b, sent: b.sent + 1, done: i + 1 } : b));
      } else {
        failures.push({ name: p.name, email: p.email, reason: res.reason });
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

  const metrics = box ? boxMetrics(box) : null;

  // Cleanup object URL on unmount (only for blob: URLs — data URLs are no-ops).
  useEffect(() => () => { if (imageUrl?.startsWith("blob:")) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  return (
    <div>
      <div className="row wrap gap-12" style={{ justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1>Certificates</h1>
          <p className="muted mt-8">
            Drop a certificate image, draw the name box, preview the name live on the canvas, then send personalized PDFs by email.
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
          {/* Stage: WYSIWYG canvas (image + live composited name) + box overlay */}
          <div className="cert-stage-card">
            <div className="cert-stage" onPointerDown={onStagePointerDown}>
              <canvas ref={stageCanvasRef} className="cert-stage-canvas" />
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

            <div className="cert-stage-meta">
              {metrics ? (
                <div className="cert-metrics">
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
                <p className="muted small">Click and drag on the canvas to draw the name box.</p>
              )}

              <div className="row gap-8 mt-16 wrap">
                <button className="btn btn--primary" onClick={saveBox} disabled={!box || saved}>
                  {saved ? "✓ Box saved" : "Save box"}
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => {
                    setImage(null);
                    setImageUrl(null);
                    setBox(null);
                    setSaved(false);
                    setProbeName("");
                    setProbeEmail("");
                    setHovered(null);
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
          </div>

          {/* Font */}
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

          {/* Test probe: custom name + email, previewed live on the canvas */}
          <div className="cert-panel">
            <div className="cert-panel__title">Test probe</div>
            <p className="muted small mt-8">
              Type any name and email below. The name appears live inside the box on
              the canvas, and the probe email sends one test certificate to it.
            </p>
            <div className="field mt-8">
              <label htmlFor="cert-probe-name">Name</label>
              <input
                id="cert-probe-name"
                className="input"
                type="text"
                placeholder="e.g. Anastasia Reyes"
                value={probeName}
                onChange={(e) => { setProbeName(e.target.value); setHovered(null); }}
              />
            </div>
            <div className="field mt-8">
              <label htmlFor="cert-probe-email">Email</label>
              <input
                id="cert-probe-email"
                className="input"
                type="email"
                placeholder="name@example.com"
                value={probeEmail}
                onChange={(e) => setProbeEmail(e.target.value)}
              />
            </div>
            <button
              className="btn btn--primary btn--block cert-send mt-8"
              onClick={sendProbe}
              disabled={sendingProbe || !probeName.trim() || !probeEmail.trim() || !box || !saved || !fontReady}
            >
              {sendingProbe ? <span className="spinner" /> : "Send probe email"}
            </button>
          </div>

          {/* Bulk send: event-scoped, filters on top, paginated list */}
          <div className="cert-panel">
            <div className="cert-panel__title">Bulk send</div>

            {/* Filters BEFORE the list */}
            <div className="cert-bulk__filters">
              <div className="field">
                <label htmlFor="cert-event">Event</label>
                <select
                  id="cert-event"
                  className="select"
                  value={selectedEventId ?? ""}
                  onChange={(e) => selectEvent(e.target.value)}
                  disabled={!events || events.length === 0}
                >
                  {!events && <option value="">Loading events…</option>}
                  {events && events.length === 0 && <option value="">No events yet</option>}
                  {events?.map((ev) => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="cert-filter">Filter</label>
                <input
                  id="cert-filter"
                  className="input"
                  type="text"
                  placeholder="Search name or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="field cert-bulk__page-size">
                <label htmlFor="cert-page-size">Rows per page</label>
                <input
                  id="cert-page-size"
                  className="input"
                  type="number"
                  min={5}
                  step={5}
                  value={pageSize}
                  onChange={(e) => setPageSize(Math.max(5, Number(e.target.value) || 50))}
                />
              </div>
              <button
                className="btn btn--ghost"
                onClick={loadEvents}
                disabled={loadingParticipants}
              >
                {loadingParticipants ? <span className="spinner spinner--dark" /> : "Refresh"}
              </button>
            </div>

            {participants && (
              <>
                {/* Selection controls: also before the list */}
                <div className="cert-bulk__actions">
                  <button className="btn btn--ghost btn--sm" onClick={selectAllFiltered}>
                    Select all ({filtered.length})
                  </button>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={selectAllNoFilter}
                    disabled={!participants || participants.length === 0}
                  >
                    Select all (no filter)
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={clearSelection}>
                    Clear
                  </button>
                  <span className="cert-bulk__count">{selected.size} selected</span>
                </div>

                {/* Paginated list: hovering a row previews its name on the canvas */}
                <div className="cert-bulk__list" onMouseLeave={() => setHovered(null)}>
                  {pageRows.map((p) => (
                    <label
                      key={p.email}
                      className={`cert-bulk__row ${hovered?.email === p.email ? "cert-bulk__row--hover" : ""}`}
                      onMouseEnter={() => setHovered(p)}
                    >
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
                  {pageRows.length === 0 && (
                    <p className="muted small" style={{ padding: "10px 4px" }}>No participants match.</p>
                  )}
                </div>

                {/* Pagination */}
                {filtered.length > Math.max(1, pageSize) && (
                  <div className="cert-pager">
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      Prev
                    </button>
                    <span className="cert-pager__info">
                      {pageStart}-{pageEnd} of {filtered.length}
                      {hovered && <span className="cert-pager__hover"> · {hovered.name}</span>}
                    </span>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                    >
                      Next
                    </button>
                  </div>
                )}

                <button
                  className="btn btn--primary btn--block cert-send mt-8"
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

          {/* Send log */}
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
      )}
    </div>
  );
}