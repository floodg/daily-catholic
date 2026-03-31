import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getWalkSessionDetail, type WalkLapDetail, type WalkSessionDetail } from "./api";

export default function WalkDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [walk, setWalk] = useState<WalkSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError("Walk not found.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    getWalkSessionDetail(sessionId)
      .then(setWalk)
      .catch((err) => {
        console.error("Failed to load walk detail", err);
        setError("Could not load this walk.");
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return <p style={{ color: "var(--text-subtle)" }}>Loading walk…</p>;
  }

  if (error || !walk) {
    return (
      <div>
        <p style={{ color: "var(--text-subtle)" }}>{error ?? "Walk not found."}</p>
        <Link to="/app/dashboard" className="btn-app-ghost">Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header-bar">
        <div>
          <div className="page-eyebrow">Walking</div>
          <h1 className="page-title">Walk <em>Detail</em></h1>
        </div>
        <Link to="/app/dashboard" className="btn-app-ghost">Back to dashboard</Link>
      </div>

      <div style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        {new Date(walk.startedAt).toLocaleString("en-AU", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem" }}>
        <section className="app-card">
          <div className="app-card-header"><span className="app-card-title">Session summary</span></div>
          <div className="app-card-body" style={{ display: "grid", gap: "0.75rem" }}>
            <SummaryGrid
              items={[
                ["Steps", walk.totalSteps.toLocaleString()],
                ["Laps", walk.totalLaps.toString()],
                ["Distance", formatDistance(walk.totalDistanceMeters)],
                ["Elapsed", formatDuration(walk.elapsedMs)],
                ["Active", formatDuration(walk.activeMs)],
                ["Paused", formatDuration(walk.pausedMs)],
                ["Avg pace", formatPace(walk.avgPaceSecPerKm)],
                ["Avg speed", `${walk.avgSpeedKmh.toFixed(2)} km/h`],
              ]}
            />
          </div>
        </section>

        <section className="app-card">
          <div className="app-card-header"><span className="app-card-title">Oval snapshot</span></div>
          <div className="app-card-body" style={{ display: "grid", gap: "0.75rem" }}>
            <SummaryGrid
              items={[
                ["Oval", walk.oval.name],
                ["Start point", `${walk.oval.startLatitude.toFixed(6)}, ${walk.oval.startLongitude.toFixed(6)}`],
                ["Trigger radius", `${walk.oval.triggerRadiusMeters} m`],
                ["Lap distance", `${walk.oval.lapDistanceMeters} m`],
                ["Min lap seconds", walk.oval.minLapSeconds.toString()],
                ["Min lap travel", `${walk.oval.minLapTravelDistanceMeters} m`],
                ["Vibration", walk.oval.vibrationEnabled ? "On" : "Off"],
                ["Sound", walk.oval.soundEnabled ? "On" : "Off"],
              ]}
            />
          </div>
        </section>
      </div>

      <section className="app-card" style={{ marginTop: "1.5rem" }}>
        <div className="app-card-header"><span className="app-card-title">Lap breakdown</span></div>
        <div className="app-card-body" style={{ display: "grid", gap: "0.75rem" }}>
          {walk.laps.length === 0 ? (
            <p style={{ margin: 0, color: "var(--text-subtle)" }}>No laps were synced for this walk.</p>
          ) : (
            walk.laps.map((lap) => <LapCard key={lap.id} lap={lap} />)
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.5rem" }}>
      {items.map(([label, value]) => (
        <div key={label} style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", borderRadius: "0.625rem", padding: "0.75rem" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{label}</div>
          <div style={{ fontWeight: 700, color: "var(--parchment)", lineHeight: 1.4 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function LapCard({ lap }: { lap: WalkLapDetail }) {
  return (
    <div style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", borderRadius: "0.625rem", padding: "0.875rem 1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "0.5rem" }}>
        <div>
          <div style={{ fontWeight: 700, color: "var(--parchment)" }}>Lap {lap.lapNumber}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {new Date(lap.lapStartedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}
            {" - "}
            {new Date(lap.lapEndedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, color: "var(--parchment)" }}>{lap.lapSteps.toLocaleString()} steps</div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{formatDistance(lap.lapDistanceMeters)}</div>
        </div>
      </div>

      <SummaryGrid
        items={[
          ["Lap time", formatDuration(lap.lapTimeMs)],
          ["Cumulative time", formatDuration(lap.cumulativeTimeMs)],
          ["Lap steps", lap.lapSteps.toLocaleString()],
          ["Cumulative steps", lap.cumulativeSteps.toLocaleString()],
          ["Lap pace", formatPace(lap.lapPaceSecPerKm)],
          ["Lap speed", `${lap.lapSpeedKmh.toFixed(2)} km/h`],
          ["Trigger GPS", `${lap.triggerLatitude.toFixed(6)}, ${lap.triggerLongitude.toFixed(6)}`],
        ]}
      />
    </div>
  );
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatDistance(distanceMeters: number) {
  if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(2)} km`;
  return `${Math.round(distanceMeters)} m`;
}

function formatPace(secondsPerKm: number) {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "N/A";
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")} /km`;
}
