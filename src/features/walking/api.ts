import { supabase } from "../../lib/supabase";

interface DbWalkSession {
  id: string;
  started_at: string;
  ended_at: string;
  elapsed_ms: number;
  active_ms: number;
  paused_ms: number;
  total_steps: number;
  total_laps: number;
  lap_distance_meters: number;
  total_distance_meters: number;
  avg_pace_sec_per_km: number;
  avg_speed_kmh: number;
  oval_name: string;
  oval_start_latitude: number;
  oval_start_longitude: number;
  oval_trigger_radius_meters: number;
  oval_lap_distance_meters: number;
  oval_min_lap_seconds: number;
  oval_min_lap_travel_distance_meters: number;
  oval_vibration_enabled: boolean;
  oval_sound_enabled: boolean;
}

interface DbWalkLap {
  id: string;
  lap_number: number;
  lap_started_at: string;
  lap_ended_at: string;
  lap_time_ms: number;
  cumulative_time_ms: number;
  lap_steps: number;
  cumulative_steps: number;
  lap_distance_meters: number;
  lap_pace_sec_per_km: number;
  lap_speed_kmh: number;
  trigger_latitude: number;
  trigger_longitude: number;
}

export interface WalkSessionSummary {
  id: string;
  startedAt: string;
  endedAt: string;
  elapsedMs: number;
  activeMs: number;
  pausedMs: number;
  totalSteps: number;
  totalLaps: number;
  lapDistanceMeters: number;
  totalDistanceMeters: number;
  avgPaceSecPerKm: number;
  avgSpeedKmh: number;
  ovalName: string;
}

export interface WalkDashboardSummary {
  recentSessions: WalkSessionSummary[];
  totalSessions: number;
  totalSteps: number;
  totalDistanceMeters: number;
  totalActiveMs: number;
}

export interface WalkOvalSnapshot {
  name: string;
  startLatitude: number;
  startLongitude: number;
  triggerRadiusMeters: number;
  lapDistanceMeters: number;
  minLapSeconds: number;
  minLapTravelDistanceMeters: number;
  vibrationEnabled: boolean;
  soundEnabled: boolean;
}

export interface WalkLapDetail {
  id: string;
  lapNumber: number;
  lapStartedAt: string;
  lapEndedAt: string;
  lapTimeMs: number;
  cumulativeTimeMs: number;
  lapSteps: number;
  cumulativeSteps: number;
  lapDistanceMeters: number;
  lapPaceSecPerKm: number;
  lapSpeedKmh: number;
  triggerLatitude: number;
  triggerLongitude: number;
}

export interface WalkSessionDetail extends WalkSessionSummary {
  oval: WalkOvalSnapshot;
  laps: WalkLapDetail[];
}

function mapWalkSession(row: DbWalkSession): WalkSessionSummary {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    elapsedMs: row.elapsed_ms,
    activeMs: row.active_ms,
    pausedMs: row.paused_ms,
    totalSteps: row.total_steps,
    totalLaps: row.total_laps,
    lapDistanceMeters: row.lap_distance_meters,
    totalDistanceMeters: row.total_distance_meters,
    avgPaceSecPerKm: row.avg_pace_sec_per_km,
    avgSpeedKmh: row.avg_speed_kmh,
    ovalName: row.oval_name,
  };
}

function mapWalkOvalSnapshot(row: DbWalkSession): WalkOvalSnapshot {
  return {
    name: row.oval_name,
    startLatitude: row.oval_start_latitude,
    startLongitude: row.oval_start_longitude,
    triggerRadiusMeters: row.oval_trigger_radius_meters,
    lapDistanceMeters: row.oval_lap_distance_meters,
    minLapSeconds: row.oval_min_lap_seconds,
    minLapTravelDistanceMeters: row.oval_min_lap_travel_distance_meters,
    vibrationEnabled: row.oval_vibration_enabled,
    soundEnabled: row.oval_sound_enabled,
  };
}

function mapWalkLap(row: DbWalkLap): WalkLapDetail {
  return {
    id: row.id,
    lapNumber: row.lap_number,
    lapStartedAt: row.lap_started_at,
    lapEndedAt: row.lap_ended_at,
    lapTimeMs: row.lap_time_ms,
    cumulativeTimeMs: row.cumulative_time_ms,
    lapSteps: row.lap_steps,
    cumulativeSteps: row.cumulative_steps,
    lapDistanceMeters: row.lap_distance_meters,
    lapPaceSecPerKm: row.lap_pace_sec_per_km,
    lapSpeedKmh: row.lap_speed_kmh,
    triggerLatitude: row.trigger_latitude,
    triggerLongitude: row.trigger_longitude,
  };
}

export async function getWalkDashboardSummary(limit = 5): Promise<WalkDashboardSummary> {
  const { data, error } = await supabase
    .from("walk_sessions")
    .select(`
      id,
      started_at,
      ended_at,
      elapsed_ms,
      active_ms,
      paused_ms,
      total_steps,
      total_laps,
      lap_distance_meters,
      total_distance_meters,
      avg_pace_sec_per_km,
      avg_speed_kmh,
      oval_name
    `)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  const recentSessions = (data as DbWalkSession[]).map(mapWalkSession);

  return {
    recentSessions,
    totalSessions: recentSessions.length,
    totalSteps: recentSessions.reduce((sum, session) => sum + session.totalSteps, 0),
    totalDistanceMeters: recentSessions.reduce((sum, session) => sum + session.totalDistanceMeters, 0),
    totalActiveMs: recentSessions.reduce((sum, session) => sum + session.activeMs, 0),
  };
}

export async function getWalkSessionDetail(sessionId: string): Promise<WalkSessionDetail> {
  const { data: session, error: sessionError } = await supabase
    .from("walk_sessions")
    .select(`
      id,
      started_at,
      ended_at,
      elapsed_ms,
      active_ms,
      paused_ms,
      total_steps,
      total_laps,
      lap_distance_meters,
      total_distance_meters,
      avg_pace_sec_per_km,
      avg_speed_kmh,
      oval_name,
      oval_start_latitude,
      oval_start_longitude,
      oval_trigger_radius_meters,
      oval_lap_distance_meters,
      oval_min_lap_seconds,
      oval_min_lap_travel_distance_meters,
      oval_vibration_enabled,
      oval_sound_enabled
    `)
    .eq("id", sessionId)
    .single();

  if (sessionError) {
    throw sessionError;
  }

  const { data: laps, error: lapsError } = await supabase
    .from("walk_laps")
    .select(`
      id,
      lap_number,
      lap_started_at,
      lap_ended_at,
      lap_time_ms,
      cumulative_time_ms,
      lap_steps,
      cumulative_steps,
      lap_distance_meters,
      lap_pace_sec_per_km,
      lap_speed_kmh,
      trigger_latitude,
      trigger_longitude
    `)
    .eq("session_id", sessionId)
    .order("lap_number", { ascending: true });

  if (lapsError) {
    throw lapsError;
  }

  const sessionRow = session as DbWalkSession;
  return {
    ...mapWalkSession(sessionRow),
    oval: mapWalkOvalSnapshot(sessionRow),
    laps: (laps as DbWalkLap[]).map(mapWalkLap),
  };
}
