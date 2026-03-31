begin;

alter table public.walk_sessions
  add column if not exists oval_name text,
  add column if not exists oval_start_latitude double precision,
  add column if not exists oval_start_longitude double precision,
  add column if not exists oval_trigger_radius_meters double precision,
  add column if not exists oval_lap_distance_meters double precision,
  add column if not exists oval_min_lap_seconds integer,
  add column if not exists oval_min_lap_travel_distance_meters double precision,
  add column if not exists oval_vibration_enabled boolean,
  add column if not exists oval_sound_enabled boolean;

update public.walk_sessions
set
  oval_name = coalesce(oval_name, 'Unknown oval'),
  oval_start_latitude = coalesce(oval_start_latitude, 0),
  oval_start_longitude = coalesce(oval_start_longitude, 0),
  oval_trigger_radius_meters = coalesce(oval_trigger_radius_meters, 0),
  oval_lap_distance_meters = coalesce(oval_lap_distance_meters, lap_distance_meters),
  oval_min_lap_seconds = coalesce(oval_min_lap_seconds, 0),
  oval_min_lap_travel_distance_meters = coalesce(oval_min_lap_travel_distance_meters, 0),
  oval_vibration_enabled = coalesce(oval_vibration_enabled, false),
  oval_sound_enabled = coalesce(oval_sound_enabled, false)
where
  oval_name is null
  or oval_start_latitude is null
  or oval_start_longitude is null
  or oval_trigger_radius_meters is null
  or oval_lap_distance_meters is null
  or oval_min_lap_seconds is null
  or oval_min_lap_travel_distance_meters is null
  or oval_vibration_enabled is null
  or oval_sound_enabled is null;

alter table public.walk_sessions
  alter column oval_name set not null,
  alter column oval_start_latitude set not null,
  alter column oval_start_longitude set not null,
  alter column oval_trigger_radius_meters set not null,
  alter column oval_lap_distance_meters set not null,
  alter column oval_min_lap_seconds set not null,
  alter column oval_min_lap_travel_distance_meters set not null,
  alter column oval_vibration_enabled set not null,
  alter column oval_sound_enabled set not null;

commit;
