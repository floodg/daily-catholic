# Daily Catholic — Android app

Native **Kotlin + Jetpack Compose** app matching the **Daily Catholic** web shell: **Fiat Mode**, **Dashboard** (today’s planned meals + synced walks), and **Supabase** email/password auth with a persisted session.

---

## Tech stack

| Layer | Technology |
|------|------------|
| Language | Kotlin |
| UI | Jetpack Compose + Material 3 |
| Navigation | Navigation Compose (login → home), bottom tabs (Fiat / Dashboard) |
| Networking | Retrofit 2 + OkHttp + Gson |
| Session | DataStore Preferences + in-memory bearer token for REST |

---

## Setup

1. Open the **`android-app/`** directory in Android Studio (JDK 17+, SDK 34).
2. Copy `local.properties.example` to `local.properties` and set `supabase.url` and `supabase.anonKey` (see example file for emulator `10.0.2.2` note).
3. Run **Run ▶** or: `cd android-app && ./gradlew assembleDebug` (Unix) / `gradlew.bat assembleDebug` (Windows).

---

## Features

- **Login** — Supabase `auth/v1/token` (password grant); errors aligned with the web login experience; session restored from DataStore on launch.
- **Fiat Mode** — Same scoring sections and checks as [`src/features/fiat/fiatScoring.ts`](../../src/features/fiat/fiatScoring.ts); persistence to `fiat_daily_entries` (week range + upsert).
- **Dashboard** — Today’s `planned_meals` with embedded `meals` + ingredients; **Mark eaten** via `mark_meal_eaten` RPC; **Skip** via PATCH; **walk_sessions** summary (Oval Walker sync). Planned workouts that only exist in the browser are explained in-app, not faked.

---

## Package / application id

`com.dailycatholic.app`
