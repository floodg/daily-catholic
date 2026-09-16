import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getWalkSessions, type WalkSessionSummary } from "./api";

export default function WalkSessionsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<WalkSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWalkSessions()
      .then(setSessions)
      .catch((err) => {
        console.error("Failed to load walk sessions", err);
        setError("Could not load walk sessions.");
      })
      .finally(() => setLoading(false));
  }, []);

  const totalSteps = sessions.reduce((sum, session) => sum + session.totalSteps, 0);
  const totalDistanceMeters = sessions.reduce((sum, session) => sum + session.totalDistanceMeters, 0);
  const totalActiveMs = sessions.reduce((sum, session) => sum + session.activeMs, 0);

  return (
    <div>
      <div className="page-header-bar">
        <div>
          <div className="page-eyebrow">Walking</div>
          <h1 className="page-title">Walk <em>Sessions</em></h1>
        </div>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-subtle)" }}>Loading walk sessions…</p>
      ) : error ? (
        <p style={{ color: "var(--text-subtle)" }}>{error}</p>
      ) : sessions.length === 0 ? (
        <section className="app-card">
          <div className="app-card-body">
            <p style={{ margin: 0, color: "var(--text-subtle)", lineHeight: 1.5 }}>
              No synced walks yet. Record a walk in `oval-walker` and tap its sync button to see it here.
            </p>
          </div>
        </section>
      ) : (
        <section className="app-card">
          <div className="app-card-header"><span className="app-card-title">All sessions</span></div>
          <div className="app-card-body" style={{ display: "grid", gap: "0.75rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.5rem" }}>
              <StatCard label="Sessions" value={sessions.length.toString()} />
              <StatCard label="Steps" value={totalSteps.toLocaleString()} />
              <StatCard label="Distance" value={formatDistance(totalDistanceMeters)} />
              <StatCard label="Active time" value={formatDuration(totalActiveMs)} />
            </div>

            <div style={{ display: "grid", gap: "0.5rem" }}>
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => navigate(`/app/walking/${session.id}`)}
                  style={{
                    background: "var(--app-bg)",
                    border: "1px solid var(--app-border)",
                    borderRadius: "0.625rem",
                    padding: "0.75rem",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--parchment)" }}>
                        {new Date(session.startedAt).toLocaleDateString("en-AU", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        {formatDuration(session.activeMs)} active · {session.totalLaps} laps · {session.ovalName}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 600, color: "var(--parchment)" }}>{session.totalSteps.toLocaleString()} steps</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{formatDistance(session.totalDistanceMeters)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", borderRadius: "0.625rem", padding: "0.75rem" }}>
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontWeight: 700, color: "var(--parchment)" }}>{value}</div>
    </div>
  );
}

function formatDuration(durationMs: number) {
  const totalMinutes = Math.round(durationMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

function formatDistance(distanceMeters: number) {
  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(distanceMeters)} m`;
}
