"use client";

// Shared OTP verification step used by both sign-in and org registration.
// On success it stores the session token and hands control back to the caller.

import { useState } from "react";
import { api, setToken, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";

interface Props {
  email: string;
  onVerified: () => void;
  onResend: () => Promise<void>;
}

export default function VerifyCodeForm({ email, onVerified, onResend }: Props) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { token } = await api<{ token: string }>("/api/auth/verify", {
        method: "POST",
        auth: false,
        body: { email, code },
      });
      setToken(token);
      onVerified();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Verification failed.", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <p className="muted" style={{ marginTop: 0 }}>
        We emailed a 6-digit code to <strong>{email}</strong>. Enter it below.
      </p>
      <div className="field">
        <label htmlFor="code">Verification code</label>
        <input
          id="code"
          className="input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          style={{ letterSpacing: 6, fontSize: "1.2rem", textAlign: "center" }}
          required
        />
      </div>
      <button className="btn btn--primary btn--block" disabled={busy || code.length < 6}>
        {busy ? <span className="spinner" /> : "Verify & continue"}
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--block mt-8"
        onClick={() => onResend().then(() => toast.push("New code sent.", "ok"))}
      >
        Resend code
      </button>
    </form>
  );
}
