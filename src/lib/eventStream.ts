"use client";

// ── Event realtime stream ────────────────────────────────────────────────────
// Subscribes to a per-event WebSocket room so every teammate viewing an event
// sees live email-send progress. The session token rides as a query param
// (browsers can't set WS headers). Auto-reconnects while mounted.

import { useEffect, useRef } from "react";
import { getToken } from "./api";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Derives the ws(s):// stream URL from the http(s) API base. */
export function streamUrl(eventId: string): string {
  const token = getToken() ?? "";
  const ws = BASE.replace(/^http/i, "ws"); // http→ws, https→wss
  return `${ws}/api/stream/${encodeURIComponent(eventId)}?token=${encodeURIComponent(token)}`;
}

export type StreamMsg =
  | { t: "ready"; room: string }
  | { t: "start"; total: number; by: string }
  | {
    t: "item";
    i: number;
    total: number;
    hash: string;
    name: string;
    email: string;
    status: "sending" | "sent" | "failed";
    reason?: string;
  }
  | { t: "done"; total: number; sent: number; failed: number; reportedTo: string | null };

/** Keeps a live subscription open for `eventId`, calling `onMsg` per message. */
export function useEventStream(eventId: string | null, onMsg: (m: StreamMsg) => void): void {
  const cb = useRef(onMsg);
  cb.current = onMsg;

  useEffect(() => {
    if (!eventId || typeof window === "undefined" || !getToken()) return;
    let socket: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      try {
        socket = new WebSocket(streamUrl(eventId));
      } catch {
        retry = setTimeout(connect, 2500);
        return;
      }
      socket.onmessage = (e) => {
        try {
          cb.current(JSON.parse(e.data) as StreamMsg);
        } catch { /* ignore malformed frames */ }
      };
      socket.onclose = () => {
        if (!closed) retry = setTimeout(connect, 2500); // reconnect with a small backoff
      };
      socket.onerror = () => socket?.close();
    };
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [eventId]);
}
