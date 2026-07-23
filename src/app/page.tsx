"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";

const PILLARS = [
  {
    title: "Participant management",
    desc: "Centralize registrations and control your participants in real time from one system.",
    points: ["Customizable registration forms", "In-person, virtual & hybrid events", "Capacity / quota management", "Event cloning"],
  },
  {
    title: "Event execution",
    desc: "Run attendance and the participant experience with zero manual steps.",
    points: ["QR code check-in", "Real-time attendance control", "Duplicate-scan safeguard", "Collaborator scanner app"],
  },
  {
    title: "Reports & measurement",
    desc: "Full visibility over your events and attendees.",
    points: ["Real-time dashboards", "Data export (CSV)", "Attendance by country & source", "Check-in rate"],
  },
];

export default function Landing() {
  const router = useRouter();
  useEffect(() => {
    if (getToken()) router.replace("/dashboard");
  }, [router]);

  return (
    <div>
      <header className="topbar">
        <div className="container topbar__inner">
          <div className="brand-mark"><span className="brand-dot" /> Convoca</div>
          <div className="grow" />
          <Link href="/login" className="btn btn--ghost btn--sm">Sign in</Link>
          <Link href="/register-org" className="btn btn--primary btn--sm">Get started</Link>
        </div>
      </header>

      <section className="container" style={{ padding: "72px 20px 40px", textAlign: "center" }}>
        <span className="badge badge--info">Event check-in, made simple</span>
        <h1 style={{ fontSize: "2.6rem", marginTop: 16, maxWidth: 720, marginInline: "auto" }}>
          Register people, email their QR, scan them in.
        </h1>
        <p className="muted" style={{ fontSize: "1.1rem", maxWidth: 620, margin: "16px auto 0" }}>
          Streamline planning, coordination, and execution from one place. Each participant gets a
          unique QR ticket by email — check them in with any phone camera.
        </p>
        <div className="row gap-12 mt-24" style={{ justifyContent: "center" }}>
          <Link href="/register-org" className="btn btn--primary">Create your organization</Link>
          <Link href="/login" className="btn btn--ghost">I already have an account</Link>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 80 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
          {PILLARS.map((p) => (
            <div className="card card--hover" key={p.title}>
              <h2>{p.title}</h2>
              <p className="muted mt-8">{p.desc}</p>
              <ul style={{ margin: "14px 0 0", paddingLeft: 18 }}>
                {p.points.map((pt) => <li key={pt} style={{ marginBottom: 6 }}>{pt}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
