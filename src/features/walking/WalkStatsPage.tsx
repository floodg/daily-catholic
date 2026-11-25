import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getWalkSessions, type WalkSessionSummary } from "./api";
import WalkStatsNav from "./WalkStatsNav";
import {
  WALK_METRICS, bestWalkPeriod, buildWalkPeriods, formatWalkDate, formatWalkDuration,
  formatWalkMetric, formatWalkPace, getWalkInsights,
} from "./statistics";
import type { WalkMetric, WalkPeriodKind, WalkTotals } from "./statistics";

type StatsView = "weekly" | "monthly" | "records";

export default function WalkStatsPage({ view }: { view: StatsView }) {
  const [sessions, setSessions] = useState<WalkSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getWalkSessions()
      .then((walks) => { if (!cancelled) setSessions(walks); })
      .catch((err) => {
        console.error("Failed to load walking statistics", err);
        if (!cancelled) setError(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt]);

  return (
    <div className="walk-stats-page">
      <div className="page-header-bar">
        <div>
          <div className="page-eyebrow">Walking · Your progress</div>
          <h1 className="page-title">{view === "records" ? <>Records & <em>Averages</em></> : <>{view === "weekly" ? "Weekly" : "Monthly"} <em>Walking</em></>}</h1>
          <p className="walk-stats-description">{view === "records" ? "Celebrate your best efforts and see the habits behind them." : "See how your walks add up, spot trends, and explore your history."}</p>
        </div>
        <Link to="/app/walking" className="btn-app-ghost">Back to walk sessions</Link>
      </div>
      <WalkStatsNav />
      {loading ? <p className="walk-stats-message" role="status">Loading walking statistics…</p>
        : error ? <section className="app-card walk-stats-message" role="alert">
          <p>Could not load your walking statistics.</p>
          <button type="button" className="btn-app-secondary" onClick={() => {
            setLoading(true); setError(false); setAttempt((value) => value + 1);
          }}>Try again</button>
        </section>
        : sessions.length === 0 ? <section className="app-card walk-stats-message">
          <h2>Your progress starts with a walk</h2>
          <p>Sync a walk from oval-walker to see your charts, records, and averages here.</p>
        </section>
        : view === "records" ? <RecordsStats sessions={sessions} />
        : <PeriodStats key={view} sessions={sessions} kind={view === "weekly" ? "week" : "month"} />}
      <p className="walk-stats-note">Based on synced walks, grouped by their start date in your local time. Weeks run Monday–Sunday. Active time excludes pauses.</p>
    </div>
  );
}

function Stat({ label, value, note, to }: { label: string; value: string; note?: string; to?: string }) {
  const content = <><span className="walk-stat-label">{label}</span><strong className="walk-stat-value">{value}</strong>{note && <span className="walk-stat-note">{note}</span>}</>;
  return to ? <Link className="walk-stat walk-stat-link" to={to}>{content}</Link> : <div className="walk-stat">{content}</div>;
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="app-card walk-stats-section">
    <div className="app-card-header"><h2 className="app-card-title">{title}</h2></div>
    <div className="app-card-body">{description && <p className="walk-stats-description">{description}</p>}{children}</div>
  </section>;
}

function MetricPicker({ metric, onChange }: { metric: WalkMetric; onChange: (metric: WalkMetric) => void }) {
  return <div className="walk-metric-picker" role="group" aria-label="Chart metric">
    {WALK_METRICS.map(({ key, label }) => <button key={key} type="button" aria-pressed={key === metric} onClick={() => onChange(key)}>{label}</button>)}
  </div>;
}

function TotalsGrid({ totals }: { totals: WalkTotals }) {
  return <div className="walk-stats-grid">
    {WALK_METRICS.map(({ key, label }) => <Stat key={key} label={label} value={formatWalkMetric(totals[key], key)} />)}
    <Stat label="Days walked" value={totals.activeDays.toLocaleString()} />
  </div>;
}

function PeriodStats({ sessions, kind }: { sessions: WalkSessionSummary[]; kind: WalkPeriodKind }) {
  const [params, setParams] = useSearchParams();
  const [metric, setMetric] = useState<WalkMetric>("distance");
  const [range, setRange] = useState(params.get("range") === "all" ? "all" : "12");
  const periods = useMemo(() => buildWalkPeriods(sessions, kind), [sessions, kind]);
  const visible = range === "all" ? periods : periods.slice(-Number(range));
  const selected = visible.find((period) => period.key === params.get("period")) ?? visible[visible.length - 1];
  const best = bestWalkPeriod(periods, metric);
  const current = periods.find((period) => period.current);
  const maximum = Math.max(1, ...visible.map((period) => period[metric]));
  const average = visible.reduce((total, period) => total + period[metric], 0) / visible.length;
  const selectedIndex = periods.findIndex((period) => period.key === selected.key);
  const previous = periods[selectedIndex - 1];
  const change = previous && previous[metric] > 0 ? (selected[metric] - previous[metric]) / previous[metric] * 100 : null;
  const metricLabel = WALK_METRICS.find((item) => item.key === metric)!.label;
  const choosePeriod = (key: string) => setParams({ period: key, range }, { replace: true });

  return <>
    <div className="walk-stats-grid walk-stats-highlights">
      <Stat label={`This ${kind} · ${metricLabel.toLowerCase()}`} value={formatWalkMetric(current?.[metric] ?? 0, metric)} note="In progress" />
      <Stat label={`Best ${kind} · ${metricLabel.toLowerCase()}`} value={best ? formatWalkMetric(best[metric], metric) : "N/A"} note={best?.label ?? "No recorded activity for this metric"} />
      <Stat label={`Average per ${kind}`} value={formatWalkMetric(average, metric)} note={`Across ${visible.length} displayed ${kind}s, including quiet periods`} />
    </div>
    <Section title={`${kind === "week" ? "Weekly" : "Monthly"} ${metricLabel.toLowerCase()}`} description="Select a bar to see that period’s totals and walks. Gold marks the all-time best for the selected metric.">
      <div className="walk-chart-controls">
        <MetricPicker metric={metric} onChange={setMetric} />
        <label className="walk-range-label">Show
          <select value={range} onChange={(event) => { setRange(event.target.value); setParams({ range: event.target.value }, { replace: true }); }}>
            <option value="12">Last 12 {kind}s</option>
            <option value={kind === "week" ? "26" : "24"}>Last {kind === "week" ? "26 weeks" : "24 months"}</option>
            {kind === "week" && <option value="52">Last 52 weeks</option>}
            <option value="all">All history</option>
          </select>
        </label>
      </div>
      <div className="walk-chart-caption"><span>{visible[0].label} to {visible[visible.length - 1].label}</span><span>Scale: 0 – {formatWalkMetric(maximum === 1 && visible.every((period) => period[metric] === 0) ? 0 : maximum, metric)}</span></div>
      <ol className="walk-bar-chart" aria-label={`${metricLabel} by ${kind}`}>
        {visible.map((period) => <li key={period.key}>
          <button type="button" className={`walk-chart-row${period.key === best?.key ? " is-best" : ""}`} aria-pressed={selected.key === period.key} onClick={() => choosePeriod(period.key)}>
            <span className="walk-chart-label">{period.label}<small>{period.current ? "In progress" : `${period.walks} ${period.walks === 1 ? "walk" : "walks"}`}{period.key === best?.key ? " · Best" : ""}</small></span>
            <span className="walk-chart-track" aria-hidden="true"><span className="walk-chart-bar" style={{ width: `${period[metric] / maximum * 100}%` }} /></span>
            <span className="walk-chart-value">{formatWalkMetric(period[metric], metric)}</span>
          </button>
        </li>)}
      </ol>
      <p className="walk-stats-note">Averages include zero-walk periods and the current, incomplete {kind}. The first recorded {kind} may also be partial.</p>
    </Section>
    <Section title={selected.label} description={selected.current ? `This ${kind} is still in progress.` : `Totals for this calendar ${kind}.`}>
      <div aria-live="polite"><TotalsGrid totals={selected} />
        <p className="walk-period-comparison">{change === null
          ? `No earlier ${kind} with activity for a percentage comparison.`
          : `${Math.abs(change).toFixed(1)}% ${change >= 0 ? "more" : "less"} ${metricLabel.toLowerCase()} than the previous ${kind}.`}
          {selected.current && previous ? ` This compares a partial ${kind} with a full ${kind}.` : ""}</p>
      </div>
      {selected.sessions.length === 0 ? <p className="walk-stats-description">No synced walks in this {kind}.</p> : <>
        <div className="walk-stats-grid walk-period-averages">
          <Stat label="Average distance / walk" value={formatWalkMetric(selected.distance / selected.walks, "distance")} />
          <Stat label="Average steps / walk" value={formatWalkMetric(selected.steps / selected.walks, "steps")} />
          <Stat label="Average active time / walk" value={formatWalkDuration(selected.time / selected.walks)} />
        </div>
        <ul className="walk-period-sessions">{selected.sessions.map((walk) => <li key={walk.id}>
          <Link to={`/app/walking/${walk.id}`}>
            <span><strong>{formatWalkDate(walk.startedAt)}</strong><small>{new Date(walk.startedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })} · {walk.ovalName}</small></span>
            <span><strong>{formatWalkMetric(walk.totalDistanceMeters, "distance")}</strong><small>{walk.totalSteps.toLocaleString()} steps · {formatWalkDuration(walk.activeMs)}</small></span>
          </Link>
        </li>)}</ul>
      </>}
    </Section>
  </>;
}

function RecordsStats({ sessions }: { sessions: WalkSessionSummary[] }) {
  const insights = useMemo(() => getWalkInsights(sessions), [sessions]);
  const weeks = useMemo(() => buildWalkPeriods(sessions, "week"), [sessions]);
  const months = useMemo(() => buildWalkPeriods(sessions, "month"), [sessions]);
  const bestWeek = bestWalkPeriod(weeks, "distance");
  const bestMonth = bestWalkPeriod(months, "distance");
  const [metric, setMetric] = useState<WalkMetric>("distance");
  const { totals, calendarDays, currentStreak, longestStreak, longestWalk, mostSteps, fastestWalk, weekdays, paceTotals } = insights;
  const maxWeekday = Math.max(1, ...weekdays.map((day) => day[metric]));
  const periodLink = (view: string, key: string) => `/app/walking/stats/${view}?period=${key}&range=all`;
  return <>
    <Section title="Lifetime totals"><TotalsGrid totals={totals} /></Section>
    <Section title="Personal bests" description="Best weeks and months are ranked by distance. Choose another metric on the weekly or monthly page to find your other records. Ties show the earliest period.">
      <div className="walk-stats-grid walk-records-grid">
        <Stat label="Best week" value={bestWeek ? formatWalkMetric(bestWeek.distance, "distance") : "N/A"} note={bestWeek ? `${bestWeek.label}${bestWeek.current ? " · In progress" : ""} · View week` : undefined} to={bestWeek ? periodLink("weekly", bestWeek.key) : undefined} />
        <Stat label="Best month" value={bestMonth ? formatWalkMetric(bestMonth.distance, "distance") : "N/A"} note={bestMonth ? `${bestMonth.label}${bestMonth.current ? " · In progress" : ""} · View month` : undefined} to={bestMonth ? periodLink("monthly", bestMonth.key) : undefined} />
        <Stat label="Longest walk" value={longestWalk ? formatWalkMetric(longestWalk.totalDistanceMeters, "distance") : "N/A"} note={longestWalk ? `${formatWalkDate(longestWalk.startedAt)} · View walk` : undefined} to={longestWalk ? `/app/walking/${longestWalk.id}` : undefined} />
        <Stat label="Most steps in one walk" value={mostSteps ? mostSteps.totalSteps.toLocaleString() : "N/A"} note={mostSteps ? `${formatWalkDate(mostSteps.startedAt)} · View walk` : undefined} to={mostSteps ? `/app/walking/${mostSteps.id}` : undefined} />
        <Stat label="Fastest walk" value={fastestWalk ? formatWalkPace(fastestWalk.totalDistanceMeters, fastestWalk.activeMs) : "N/A"} note={fastestWalk ? `${formatWalkDate(fastestWalk.startedAt)} · ${formatWalkMetric(fastestWalk.totalDistanceMeters, "distance")} · View walk` : undefined} to={fastestWalk ? `/app/walking/${fastestWalk.id}` : undefined} />
        <Stat label="Longest walking streak" value={`${longestStreak} ${longestStreak === 1 ? "day" : "days"}`} note="Consecutive calendar days with a synced walk" />
      </div>
    </Section>
    <Section title="Averages & consistency" description={`From ${formatWalkDate(insights.firstWalkAt!)} to today. Calendar averages include rest days; weekly and monthly averages include partial periods.`}>
      <div className="walk-stats-grid">
        <Stat label="Distance / walk" value={formatWalkMetric(totals.distance / totals.walks, "distance")} />
        <Stat label="Steps / walk" value={formatWalkMetric(totals.steps / totals.walks, "steps")} />
        <Stat label="Active time / walk" value={formatWalkDuration(totals.time / totals.walks)} />
        <Stat label="Distance / calendar day" value={formatWalkMetric(totals.distance / calendarDays, "distance")} />
        <Stat label="Steps / calendar day" value={formatWalkMetric(totals.steps / calendarDays, "steps")} />
        <Stat label="Distance / walking day" value={formatWalkMetric(totals.distance / totals.activeDays, "distance")} />
        <Stat label="Distance / week" value={formatWalkMetric(totals.distance / weeks.length, "distance")} />
        <Stat label="Distance / month" value={formatWalkMetric(totals.distance / months.length, "distance")} />
        <Stat label="Walks / week" value={formatWalkMetric(totals.walks / weeks.length, "walks")} />
        <Stat label="Overall pace" value={formatWalkPace(paceTotals.distance, paceTotals.time)} note="Total active time ÷ total distance for walks with both recorded" />
        <Stat label="Overall speed" value={paceTotals.time > 0 ? `${(paceTotals.distance / paceTotals.time * 3600).toFixed(2)} km/h` : "N/A"} />
        <Stat label="Days walked" value={`${(totals.activeDays / calendarDays * 100).toFixed(0)}%`} note={`${totals.activeDays} of ${calendarDays} calendar days`} />
        <Stat label="Current streak" value={`${currentStreak} ${currentStreak === 1 ? "day" : "days"}`} note="Includes a streak ending yesterday, so you have today to continue it" />
      </div>
    </Section>
    <Section title="Your walking week" description="All-time totals by day of the week. See which days you walk the most.">
      <MetricPicker metric={metric} onChange={setMetric} />
      <ul className="walk-bar-chart walk-weekday-chart" aria-label={`${WALK_METRICS.find((item) => item.key === metric)!.label} by weekday`}>
        {weekdays.map((day) => <li key={day.label} className="walk-chart-row">
          <span className="walk-chart-label">{day.label}<small>{day.walks} {day.walks === 1 ? "walk" : "walks"}</small></span>
          <span className="walk-chart-track" aria-hidden="true"><span className="walk-chart-bar" style={{ width: `${day[metric] / maxWeekday * 100}%` }} /></span>
          <span className="walk-chart-value">{formatWalkMetric(day[metric], metric)}</span>
        </li>)}
      </ul>
    </Section>
  </>;
}
