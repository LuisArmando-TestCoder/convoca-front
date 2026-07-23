"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import { MeContext } from "@/components/session";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { me, loading } = useMe();
  const router = useRouter();
  const pathname = usePathname();

  if (loading || !me) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <span className="spinner spinner--dark" style={{ width: 28, height: 28 }} />
      </div>
    );
  }

  function signOut() {
    clearToken();
    router.replace("/login");
  }

  const isTeam = pathname.startsWith("/dashboard/team");

  return (
    <MeContext.Provider value={me}>
      <header className="topbar">
        <div className="container topbar__inner">
          <Link href="/dashboard" className="brand-mark" style={{ textDecoration: "none" }}>
            <span className="brand-dot" /> Convoca
          </Link>
          <nav className="row gap-8" style={{ marginLeft: 12 }}>
            <Link href="/dashboard" className={`tab ${!isTeam ? "tab--active" : ""}`} style={{ border: "none" }}>
              Events
            </Link>
            {me.role === "owner" && (
              <Link href="/dashboard/team" className={`tab ${isTeam ? "tab--active" : ""}`} style={{ border: "none" }}>
                Team
              </Link>
            )}
          </nav>
          <div className="grow" />
          <div className="row gap-12">
            <div className="stack" style={{ alignItems: "flex-end", lineHeight: 1.2 }}>
              <strong className="small">{me.org.name}</strong>
              <span className="muted small">{me.email} · {me.role}</span>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="container" style={{ padding: "28px 20px 60px" }}>
        {children}
      </main>
    </MeContext.Provider>
  );
}
