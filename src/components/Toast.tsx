"use client";

// App-wide toast notifications. One provider mounted at the root; components
// call `useToast().push(...)`.

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastKind = "ok" | "err" | "info";
interface Toast { id: number; kind: ToastKind; text: string; }

interface ToastCtx { push: (text: string, kind?: ToastKind) => void; }

const Ctx = createContext<ToastCtx>({ push: () => {} });

export function useToast(): ToastCtx {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((text: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === "ok" ? "toast--ok" : t.kind === "err" ? "toast--err" : ""}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
