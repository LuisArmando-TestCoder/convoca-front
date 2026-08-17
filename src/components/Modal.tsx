"use client";

import { type ReactNode, useEffect } from "react";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** Accessible modal: closes on Escape + overlay click, traps nothing fancy. */
export default function Modal({ title, onClose, children, footer }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()} style={{ maxHeight: "90vh", overflowY: "auto" }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <h2>{title}</h2>
          <button className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
        {footer && <div className="row gap-8 mt-16" style={{ justifyContent: "flex-end" }}>{footer}</div>}
      </div>
    </div>
  );
}
