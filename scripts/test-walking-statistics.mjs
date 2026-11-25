import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";
import { bestWalkPeriod, buildWalkPeriods, formatWalkPace, getWalkInsights } from "../src/features/walking/statistics.ts";

// Exercise a timezone with both midnight UTC offsets and daylight-saving changes.
process.env.TZ = "Australia/Sydney";

function walk(id, date, distance = 1000, activeMs = 600000, steps = 1500) {
  return {
    id, startedAt: new Date(date).toISOString(), endedAt: new Date(date).toISOString(),
    totalDistanceMeters: distance, activeMs, totalSteps: steps, totalLaps: 2,
    elapsedMs: activeMs, pausedMs: 0, lapDistanceMeters: 500,
    avgPaceSecPerKm: 0, avgSpeedKmh: 0, ovalName: "Test oval",
  };
}

test("weeks use local Monday boundaries across a year change", () => {
  const periods = buildWalkPeriods([
    walk("sunday", "2025-01-05T23:59:00+11:00"),
    walk("monday", "2025-01-06T00:01:00+11:00", 3000),
    walk("new-year", "2025-01-01T08:00:00+11:00", 2000),
  ], "week", new Date("2025-01-07T12:00:00+11:00"));
  assert.deepEqual(periods.map((period) => [period.key, period.distance, period.walks]), [
    ["2024-12-30", 3000, 2], ["2025-01-06", 3000, 1],
  ]);
  assert.equal(periods[0].end.getDate(), 5);
  assert.equal(periods[1].current, true);
  assert.equal(bestWalkPeriod(periods, "distance").key, "2024-12-30");
});

test("month history fills quiet months and leap February through the current month", () => {
  const periods = buildWalkPeriods([
    walk("jan", "2024-01-31T23:59:00+11:00", 5000),
    walk("mar", "2024-03-01T00:01:00+11:00", 1000, 300000, 7000),
  ], "month", new Date("2024-04-05T12:00:00+11:00"));
  assert.deepEqual(periods.map((period) => period.key), ["2024-01-01", "2024-02-01", "2024-03-01", "2024-04-01"]);
  assert.equal(periods[1].end.getDate(), 29);
  assert.equal(periods[1].distance, 0);
  assert.equal(periods[3].current, true);
  assert.equal(bestWalkPeriod(periods, "distance").key, "2024-01-01");
  assert.equal(bestWalkPeriod(periods, "steps").key, "2024-03-01");
  assert.equal(periods.reduce((sum, period) => sum + period.distance, 0) / periods.length, 1500);
});

test("empty history produces no periods, records, or streaks", () => {
  assert.deepEqual(buildWalkPeriods([], "week"), []);
  assert.equal(bestWalkPeriod([], "distance"), null);
  const result = getWalkInsights([]);
  assert.equal(result.currentStreak, 0);
  assert.equal(result.longestStreak, 0);
  assert.equal(result.calendarDays, 0);
  assert.equal(result.fastestWalk, null);
});

test("multiple walks on a day count once toward walking days and streaks", () => {
  const sessions = [
    walk("a", "2026-11-20T08:00:00+11:00"), walk("b", "2026-11-20T18:00:00+11:00"),
    walk("c", "2026-11-21T08:00:00+11:00"), walk("d", "2026-11-23T08:00:00+11:00"),
  ];
  const result = getWalkInsights(sessions, new Date("2026-11-24T14:00:00+11:00"));
  assert.equal(result.totals.walks, 4);
  assert.equal(result.totals.activeDays, 3);
  assert.equal(result.calendarDays, 5);
  assert.equal(result.longestStreak, 2);
  assert.equal(result.currentStreak, 1);
  assert.equal(result.weekdays.find((day) => day.label === "Friday").walks, 2);
  assert.equal(result.firstWalkAt, sessions[0].startedAt);
  assert.equal(getWalkInsights(sessions, new Date("2026-11-25T12:00:00+11:00")).currentStreak, 0);
});

test("streaks and calendar-day averages survive both daylight-saving transitions", () => {
  for (const [dates, now] of [
    [["2026-04-04T08:00:00+11:00", "2026-04-05T08:00:00+10:00", "2026-04-06T08:00:00+10:00"], "2026-04-06T12:00:00+10:00"],
    [["2026-10-03T08:00:00+10:00", "2026-10-04T08:00:00+11:00", "2026-10-05T08:00:00+11:00"], "2026-10-05T12:00:00+11:00"],
  ]) {
    const sessions = dates.map((date, index) => walk(String(index), date));
    const result = getWalkInsights(sessions, new Date(now));
    assert.equal(result.calendarDays, 3);
    assert.equal(result.currentStreak, 3);
    assert.equal(result.longestStreak, 3);
    assert.equal(result.totals.distance / result.calendarDays, 1000);
  }
});

test("pace is distance weighted, excludes incomplete readings, and rounds seconds correctly", () => {
  const result = getWalkInsights([
    walk("short-fast", "2026-11-20T08:00:00+11:00", 1000, 300000),
    walk("long-slow", "2026-11-21T08:00:00+11:00", 9000, 5400000),
    walk("no-distance", "2026-11-22T08:00:00+11:00", 0, 600000),
    walk("no-time", "2026-11-23T08:00:00+11:00", 90000, 0),
  ]);
  assert.equal(result.fastestWalk.id, "short-fast");
  assert.equal(formatWalkPace(result.paceTotals.distance, result.paceTotals.time), "9:30 /km");
  assert.equal(formatWalkPace(1000, 359600), "6:00 /km");
  assert.equal(formatWalkPace(0, 1000), "N/A");
  assert.equal(formatWalkPace(1000, 0), "N/A");
});

test("single zero-valued walk does not invent a distance or speed record", () => {
  const sessions = [walk("zero", "2026-11-24T08:00:00+11:00", 0, 0, 0)];
  const result = getWalkInsights(sessions, new Date("2026-11-24T12:00:00+11:00"));
  assert.equal(result.longestWalk, null);
  assert.equal(result.fastestWalk, null);
  assert.equal(result.mostSteps, null);
  assert.equal(bestWalkPeriod(buildWalkPeriods(sessions, "month"), "distance"), null);
});

test("walk history fetches beyond 1,000 rows and respects a lower server row cap", async (context) => {
  const source = await readFile(new URL("../src/features/walking/api.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source.replace(
    'import { supabase } from "../../lib/supabase";',
    "const supabase = globalThis.walkPaginationTestClient;",
  ), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const rows = Array.from({ length: 2005 }, (_, index) => ({
    id: `walk-${index}`, started_at: "2026-11-24T08:00:00+11:00", ended_at: "2026-11-24T09:00:00+11:00",
    active_ms: 600000, elapsed_ms: 600000, paused_ms: 0, total_steps: 1500,
    total_laps: 2, lap_distance_meters: 500, total_distance_meters: 1000,
    avg_pace_sec_per_km: 600, avg_speed_kmh: 6, oval_name: "Test oval",
  }));
  for (const serverCap of [1000, 250]) {
    await context.test(`server cap ${serverCap}`, async () => {
      const requests = [];
      globalThis.walkPaginationTestClient = createClient("https://walk-test.supabase.co", "test-key", {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: async (input) => {
          const url = new URL(String(input));
          requests.push(url);
          const offset = Number(url.searchParams.get("offset") ?? 0);
          const limit = Math.min(Number(url.searchParams.get("limit")), serverCap);
          return new Response(JSON.stringify(rows.slice(offset, offset + limit)), { status: 200, headers: { "Content-Type": "application/json" } });
        } },
      });
      const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}#${serverCap}`);
      const result = await api.getWalkSessions();
      assert.equal(result.length, 2005);
      assert.equal(new Set(result.map((row) => row.id)).size, 2005);
      assert.equal(result.reduce((sum, row) => sum + row.totalSteps, 0), 3007500);
      assert.equal(requests.length, Math.ceil(rows.length / serverCap) + 1);
      assert.equal(requests[0].searchParams.get("order"), "started_at.desc,id.desc");
      assert.equal(requests[1].searchParams.get("offset"), String(serverCap));
    });
  }
  delete globalThis.walkPaginationTestClient;
});
