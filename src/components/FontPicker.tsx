"use client";

// ── FontPicker ────────────────────────────────────────────────────────────────
// A custom, ultra-beautiful font selector. Each option renders in its own
// typeface (lazy-loaded via the FontFace API). The trigger shows the currently
// selected font in its own font; the panel is a glassy, animated list with
// hover states and a checkmark on the active choice.

import { useEffect, useRef, useState } from "react";
import { CERTIFICATE_FONTS, type CertificateFont } from "@/lib/certificateFonts";

interface FontPickerProps {
  value: CertificateFont;
  readyFonts: Set<string>;
  loading: boolean;
  onChange: (font: CertificateFont) => void;
}

export default function FontPicker({ value, readyFonts, loading, onChange }: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const select = (f: CertificateFont) => {
    onChange(f);
    setOpen(false);
  };

  return (
    <div className="font-picker" ref={rootRef}>
      {/* Trigger */}
      <button
        type="button"
        className="font-picker__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className="font-picker__trigger-label"
          style={{ fontFamily: readyFonts.has(value.family) ? `"${value.family}", serif` : undefined }}
        >
          {value.label}
        </span>
        <span className="font-picker__trigger-vibe">{value.vibe}</span>
        <svg
          className={`font-picker__chevron ${open ? "font-picker__chevron--open" : ""}`}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Panel */}
      {open && (
        <div className="font-picker__panel" role="listbox">
          <div className="font-picker__panel-head">
            <span>Choose a font</span>
            <span className="font-picker__panel-count">{CERTIFICATE_FONTS.length} families</span>
          </div>
          <div className="font-picker__list">
            {CERTIFICATE_FONTS.map((f) => {
              const ready = readyFonts.has(f.family);
              const active = f.family === value.family;
              return (
                <button
                  key={f.family}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`font-picker__option ${active ? "font-picker__option--active" : ""}`}
                  onClick={() => select(f)}
                >
                  <span
                    className="font-picker__option-name"
                    style={ready ? { fontFamily: `"${f.family}", serif` } : undefined}
                  >
                    {f.label}
                  </span>
                  <span className="font-picker__option-vibe">{f.vibe}</span>
                  {active && (
                    <svg className="font-picker__check" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3 8.5l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
          {loading && (
            <div className="font-picker__loading">
              <span className="spinner spinner--dark" /> Loading font…
            </div>
          )}
        </div>
      )}
    </div>
  );
}