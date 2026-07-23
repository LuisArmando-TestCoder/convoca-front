"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import VerifyCodeForm from "@/components/VerifyCodeForm";

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function requestCode() {
    await api("/api/auth/request-code", { method: "POST", auth: false, body: { email } });
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await requestCode();
      setSent(true);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Could not send code.", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand-mark" style={{ justifyContent: "center", marginBottom: 20 }}>
          <span className="brand-dot" /> Convoca
        </div>
        <div className="card card--pad-lg">
          <h1 style={{ textAlign: "center" }}>Sign in</h1>
          <p className="muted center mt-8" style={{ marginBottom: 20 }}>
            Owners and collaborators sign in with a one-time code.
          </p>

          {!sent ? (
            <form onSubmit={submitEmail}>
              <div className="field">
                <label htmlFor="email">Work email</label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                />
              </div>
              <button className="btn btn--primary btn--block" disabled={busy || !email}>
                {busy ? <span className="spinner" /> : "Send me a code"}
              </button>
            </form>
          ) : (
            <VerifyCodeForm
              email={email}
              onResend={requestCode}
              onVerified={() => router.replace("/dashboard")}
            />
          )}
        </div>
        <p className="center muted small mt-16">
          New here? <Link href="/register-org">Create an organization</Link>
        </p>
      </div>
    </div>
  );
}
