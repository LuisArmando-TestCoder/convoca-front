"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import VerifyCodeForm from "@/components/VerifyCodeForm";

export default function RegisterOrgPage() {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({ orgName: "", email: "", gmailUser: "", gmailPass: "" });
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function register() {
    // Gmail is optional: only send a sender address when an App Password is given
    // (otherwise the platform's own account sends the email).
    const payload = {
      orgName: form.orgName,
      email: form.email,
      gmailPass: form.gmailPass,
      gmailUser: form.gmailPass ? form.gmailUser || form.email : "",
    };
    await api("/api/auth/register", { method: "POST", auth: false, body: payload });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await register();
      setSent(true);
      toast.push("Code sent — check your inbox.", "ok");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Registration failed.", "err");
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ maxWidth: 460 }}>
        <div className="brand-mark" style={{ justifyContent: "center", marginBottom: 20 }}>
          <span className="brand-dot" /> Convoca
        </div>
        <div className="card card--pad-lg">
          <h1 style={{ textAlign: "center" }}>Create your organization</h1>
          <p className="muted center mt-8" style={{ marginBottom: 20 }}>
            Codes and QR tickets are emailed from Convoca. Optionally send from your own Gmail.
          </p>


          {!sent ? (
            <form onSubmit={submit}>
              <div className="field">
                <label htmlFor="orgName">Organization name</label>
                <input id="orgName" className="input" value={form.orgName} onChange={set("orgName")} placeholder="Acme Events" required />
              </div>
              <div className="field">
                <label htmlFor="email">Owner email</label>
                <input id="email" className="input" type="email" value={form.email} onChange={set("email")} placeholder="you@company.com" required />
              </div>
              <details style={{ marginBottom: 14 }}>
                <summary className="small" style={{ cursor: "pointer", color: "var(--slate-700)", fontWeight: 650 }}>
                  Use your own Gmail to send (optional)
                </summary>
                <div style={{ marginTop: 12 }}>
                  <div className="field">
                    <label htmlFor="gmailUser">Gmail sender address</label>
                    <input id="gmailUser" className="input" type="email" value={form.gmailUser} onChange={set("gmailUser")} placeholder="Defaults to owner email" />
                    <span className="hint">The Gmail account that will send your emails.</span>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor="gmailPass">Gmail App Password</label>
                    <input id="gmailPass" className="input" type="password" value={form.gmailPass} onChange={set("gmailPass")} placeholder="16-character app password" />
                    <span className="hint">
                      Create one at Google Account → Security → App passwords. Not your login password.
                    </span>
                  </div>
                </div>
              </details>

              <button className="btn btn--primary btn--block" disabled={busy}>
                {busy ? <span className="spinner" /> : "Verify & send code"}
              </button>
            </form>
          ) : (
            <VerifyCodeForm
              email={form.email}
              onResend={register}
              onVerified={() => router.replace("/dashboard")}
            />
          )}
        </div>
        <p className="center muted small mt-16">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
