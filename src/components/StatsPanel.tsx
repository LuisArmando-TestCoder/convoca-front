"use client";

import type { EventStats } from "@/lib/types";

/** Real-time attendance summary: totals, check-in rate bar, and breakdowns. */
export default function StatsPanel({ stats }: { stats: EventStats }) {
  const countries = Object.entries(stats.byCountry).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <div className="stack gap-16">
      <div className="stat-grid">
        <div className="stat">
          <div className="stat__num">{stats.total}</div>
          <div className="stat__label">Registered{stats.quota != null ? ` / ${stats.quota}` : ""}</div>
        </div>
        <div className="stat">
          <div className="stat__num" style={{ color: "var(--success)" }}>{stats.checkedIn}</div>
          <div className="stat__label">Checked in</div>
        </div>
        <div className="stat">
          <div className="stat__num" style={{ color: "var(--slate-500)" }}>{stats.pending}</div>
          <div className="stat__label">Pending</div>
        </div>
        <div className="stat">
          <div className="stat__num" style={{ color: "var(--brand)" }}>{stats.rate}%</div>
          <div className="stat__label">Attendance rate</div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <strong className="small">Check-in progress</strong>
          <span className="muted small">{stats.checkedIn} / {stats.total}</span>
        </div>
        <div className="progress"><div className="progress__bar" style={{ width: `${stats.rate}%` }} /></div>
      </div>

      {countries.length > 0 && (
        <div className="card">
          <strong className="small">By country</strong>
          <div className="stack gap-8 mt-8">
            {countries.map(([country, n]) => (
              <div key={country} className="row gap-12">
                <span style={{ width: 120 }} className="small">{country}</span>
                <div className="progress grow">
                  <div className="progress__bar" style={{ width: `${(n / stats.total) * 100}%` }} />
                </div>
                <span className="muted small" style={{ width: 30, textAlign: "right" }}>{n}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
