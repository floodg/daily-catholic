import { BarChart3, CalendarDays, Trophy } from "lucide-react";
import { NavLink } from "react-router-dom";
import "./walking-stats.css";

export default function WalkStatsNav() {
  return (
    <nav className="walk-stats-nav" aria-label="Walking statistics">
      <NavLink to="/app/walking/stats/weekly">
        <BarChart3 size={22} aria-hidden="true" />
        <span><strong>Weekly stats</strong><small>Weekly totals, trends & best week</small></span>
      </NavLink>
      <NavLink to="/app/walking/stats/monthly">
        <CalendarDays size={22} aria-hidden="true" />
        <span><strong>Monthly stats</strong><small>Monthly totals, trends & best month</small></span>
      </NavLink>
      <NavLink to="/app/walking/stats/records">
        <Trophy size={22} aria-hidden="true" />
        <span><strong>Records & averages</strong><small>Personal bests, pace & consistency</small></span>
      </NavLink>
    </nav>
  );
}
