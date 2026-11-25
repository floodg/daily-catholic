import type { WalkSessionSummary } from "./api";
import { formatDateLocal, getMondayLocal } from "../../lib/dateUtils.ts";

export type WalkPeriodKind = "week" | "month";
export type WalkMetric = "distance" | "steps" | "time" | "walks" | "laps";

export interface WalkTotals {
  distance: number;
  steps: number;
  time: number;
  walks: number;
  laps: number;
  activeDays: number;
}

export interface WalkPeriod extends WalkTotals {
  key: string;
  start: Date;
  end: Date;
  label: string;
  current: boolean;
  sessions: WalkSessionSummary[];
}

export const WALK_METRICS: { key: WalkMetric; label: string }[] = [
  { key: "distance", label: "Distance" },
  { key: "steps", label: "Steps" },
  { key: "time", label: "Active time" },
  { key: "walks", label: "Walks" },
  { key: "laps", label: "Laps" },
];

export function formatWalkDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function formatWalkDuration(ms: number) {
  const minutes = Math.round(ms / 60000);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours.toLocaleString()}h ${minutes % 60}m` : `${minutes}m`;
}

export function formatWalkMetric(value: number, metric: WalkMetric) {
  if (metric === "distance") return `${(value / 1000).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
  if (metric === "time") return formatWalkDuration(value);
  return value.toLocaleString("en-AU", { maximumFractionDigits: metric === "walks" || metric === "laps" ? 1 : 0 });
}

export function formatWalkPace(distance: number, time: number) {
  if (distance <= 0 || time <= 0) return "N/A";
  const seconds = Math.round(time / distance);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} /km`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function periodStart(date: Date, kind: WalkPeriodKind) {
  return kind === "week" ? startOfDay(getMondayLocal(date)) : new Date(date.getFullYear(), date.getMonth(), 1);
}

function nextPeriod(date: Date, kind: WalkPeriodKind) {
  const next = new Date(date);
  if (kind === "week") next.setDate(next.getDate() + 7);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

// Calendar ordinals avoid 23/25-hour DST days affecting averages and streaks.
function dayNumber(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}

export function sumWalks(sessions: WalkSessionSummary[]): WalkTotals {
  return {
    distance: sessions.reduce((sum, walk) => sum + walk.totalDistanceMeters, 0),
    steps: sessions.reduce((sum, walk) => sum + walk.totalSteps, 0),
    time: sessions.reduce((sum, walk) => sum + walk.activeMs, 0),
    walks: sessions.length,
    laps: sessions.reduce((sum, walk) => sum + walk.totalLaps, 0),
    activeDays: new Set(sessions.map((walk) => formatDateLocal(new Date(walk.startedAt)))).size,
  };
}

export function buildWalkPeriods(sessions: WalkSessionSummary[], kind: WalkPeriodKind, now = new Date()): WalkPeriod[] {
  if (sessions.length === 0) return [];
  const grouped = new Map<string, WalkSessionSummary[]>();
  let first = periodStart(now, kind);
  let last = first;
  for (const session of sessions) {
    const start = periodStart(new Date(session.startedAt), kind);
    const key = formatDateLocal(start);
    const walks = grouped.get(key) ?? [];
    walks.push(session);
    grouped.set(key, walks);
    if (start < first) first = start;
    if (start > last) last = start;
  }
  const currentKey = formatDateLocal(periodStart(now, kind));
  const periods: WalkPeriod[] = [];
  for (let start = first; start <= last; start = nextPeriod(start, kind)) {
    const key = formatDateLocal(start);
    const end = nextPeriod(start, kind);
    end.setDate(end.getDate() - 1);
    const walks = (grouped.get(key) ?? []).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    periods.push({
      ...sumWalks(walks), key, start, end, sessions: walks, current: key === currentKey,
      label: kind === "week"
        ? `${start.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${formatWalkDate(end)}`
        : start.toLocaleDateString("en-AU", { month: "long", year: "numeric" }),
    });
  }
  return periods;
}

export function bestWalkPeriod(periods: WalkPeriod[], metric: WalkMetric) {
  return periods.reduce<WalkPeriod | null>((best, period) =>
    period[metric] > 0 && (!best || period[metric] > best[metric]) ? period : best, null);
}

export function getWalkInsights(sessions: WalkSessionSummary[], now = new Date()) {
  const totals = sumWalks(sessions);
  const firstWalkAt = sessions.reduce<string | null>((first, walk) =>
    !first || new Date(walk.startedAt) < new Date(first) ? walk.startedAt : first, null);
  const days = [...new Set(sessions.map((walk) => dayNumber(new Date(walk.startedAt))))].sort((a, b) => a - b);
  const today = dayNumber(now);
  const calendarDays = days.length ? Math.max(1, today - days[0] + 1) : 0;
  let longestStreak = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
  }
  const daySet = new Set(days);
  let currentStreak = 0;
  for (let day = daySet.has(today) ? today : today - 1; daySet.has(day); day--) currentStreak++;

  const longestWalk = sessions.reduce<WalkSessionSummary | null>((best, walk) =>
    walk.totalDistanceMeters > 0 && (!best || walk.totalDistanceMeters > best.totalDistanceMeters) ? walk : best, null);
  const mostSteps = sessions.reduce<WalkSessionSummary | null>((best, walk) =>
    walk.totalSteps > 0 && (!best || walk.totalSteps > best.totalSteps) ? walk : best, null);
  const fastestWalk = sessions.reduce<WalkSessionSummary | null>((best, walk) => {
    if (walk.totalDistanceMeters <= 0 || walk.activeMs <= 0) return best;
    return !best || walk.activeMs / walk.totalDistanceMeters < best.activeMs / best.totalDistanceMeters ? walk : best;
  }, null);
  const paceWalks = sessions.filter((walk) => walk.totalDistanceMeters > 0 && walk.activeMs > 0);
  const paceTotals = sumWalks(paceWalks);
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((label, index) => ({
    label,
    ...sumWalks(sessions.filter((walk) => (new Date(walk.startedAt).getDay() + 6) % 7 === index)),
  }));
  return { totals, firstWalkAt, calendarDays, longestStreak, currentStreak, longestWalk, mostSteps, fastestWalk, paceTotals, weekdays };
}
