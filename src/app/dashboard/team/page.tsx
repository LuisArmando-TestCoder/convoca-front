"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { useSession } from "@/components/session";
import type { Collaborator } from "@/lib/types";

export default function TeamPage() {
  const me = useSession();
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", email: "" });
  const [busy, setBusy] = useState(false);

  // Collaborators can't manage the team — bounce them to events.
  useEffect(() => {
    if (me.role !== "owner") router.replace("/dashboard");
  }, [me.role, router]);

  async function load() {
    try {
      const { collaborators } = await api<{ collaborators: Collaborator[] }>("/api/collaborators");
      setList(collaborators);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/collaborators", { method: "POST", body: form });
      toast.push("Collaborator invited.", "ok");
      setForm({ name: "", email: "" });
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Could not add collaborator.", "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Collaborator) {
    if (!confirm(`Remove ${c.name}?`)) return;
    try {
      await api(`/api/collaborators/${encodeURIComponent(c.email)}`, { method: "DELETE" });
      toast.push("Removed.", "ok");
      load();
    } catch {
      toast.push("Delete failed.", "err");
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h1>Team</h1>
      <p className="muted mt-8">
        Invite collaborators by email. They sign in with a one-time code and can manage participants
        and scan check-ins for every event.
      </p>

      <form className="card mt-16" onSubmit={add}>
        <div className="row gap-12 wrap">
          <div className="field grow" style={{ minWidth: 160, marginBottom: 0 }}>
            <label>Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jane Doe" />
          </div>
          <div className="field grow" style={{ minWidth: 200, marginBottom: 0 }}>
            <label>Email</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="jane@company.com" required />
          </div>
          <div className="field" style={{ marginBottom: 0, alignSelf: "flex-end" }}>
            <button className="btn btn--primary" disabled={busy}>{busy ? <span className="spinner" /> : "Invite"}</button>
          </div>
        </div>
      </form>

      <div className="mt-24">
        {loading ? (
          <div className="center" style={{ padding: 30 }}><span className="spinner spinner--dark" /></div>
        ) : list.length === 0 ? (
          <div className="card center" style={{ padding: 40 }}><p className="muted">No collaborators yet.</p></div>
        ) : (
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="table">
              <thead><tr><th>Name</th><th>Email</th><th className="actions">Actions</th></tr></thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.email}>
                    <td>{c.name}</td>
                    <td className="muted">{c.email}</td>
                    <td className="actions">
                      <button className="btn btn--danger btn--sm" onClick={() => remove(c)}>Remove</button>
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
