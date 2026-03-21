# Joe's Keto — Android Companion App

A native Android companion app built with **Kotlin + Jetpack Compose** that connects to the existing Supabase backend and displays **Today's Agenda** (meals, workout, and daily targets).

> **Phase 1 — read-only agenda display.**  
> The React web app remains the primary planning/admin interface.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | Kotlin |
| UI | Jetpack Compose + Material 3 |
| Navigation | Navigation Compose |
| State | ViewModel + StateFlow |
| Networking | Retrofit 2 + OkHttp |
| JSON | Gson |
| Session storage | DataStore Preferences |
| Min SDK | 26 (Android 8.0) |

---

## Project Structure

```
android-app/
  app/
    src/main/java/com/joesketo/app/
      data/
        api/
          RetrofitClient.kt       – OkHttp + Retrofit setup with Supabase apikey header
          SupabaseApiService.kt   – Retrofit interface (auth + agenda endpoints)
        models/
          AgendaModels.kt         – TodayAgenda, Meal, Workout, Targets data classes
          AuthModels.kt           – LoginRequest / LoginResponse data classes
        repository/
          AgendaRepository.kt     – Interface for fetching today's agenda
          MockAgendaRepository.kt – Hard-coded mock data (Phase 1)
          AuthRepository.kt       – Supabase sign-in + DataStore session persistence
      ui/
        login/
          LoginScreen.kt          – Email + password sign-in composable
          LoginViewModel.kt       – Sign-in logic + state
        today/
          TodayScreen.kt          – Today's Agenda scaffold
          TodayViewModel.kt       – Agenda loading logic + state
          MealsCard.kt            – Meals section composable
          WorkoutCard.kt          – Workout section composable
          TargetsCard.kt          – Daily targets composable
        theme/
          Color.kt / Type.kt / Theme.kt
      MainActivity.kt             – NavHost: Login → Today
```

---

## Setup

### Prerequisites

- Android Studio Hedgehog (2023.1.1) or later
- JDK 17+
- Android SDK 34

### 1. Open in Android Studio

Open the **`android-app/`** directory as the project root in Android Studio.  
Android Studio will automatically download the Gradle wrapper JAR and sync dependencies.

### 2. Configure Supabase credentials

Copy the example properties file:

```bash
cp android-app/local.properties.example android-app/local.properties
```

Then edit `android-app/local.properties`:

```properties
# Local dev (Supabase CLI) — 10.0.2.2 maps to host localhost in the emulator
supabase.url=http://10.0.2.2:54321
supabase.anonKey=<anon-key from `supabase status`>
```

For production, replace with your Supabase cloud project URL and anon key.

> **Note:** `local.properties` is git-ignored and never committed.

### 3. Run

Select an emulator or physical device and click **Run ▶** in Android Studio,  
or from the terminal:

```bash
cd android-app
./gradlew assembleDebug
```

---

## Authentication

The app uses **Supabase Auth** (email + password).

- Signs in via `POST /auth/v1/token?grant_type=password`
- Stores the `access_token` and `refresh_token` in **DataStore Preferences**
- On restart, the stored token is read and the user is navigated directly to Today's Agenda without re-logging in
- Sign-out clears the stored tokens

---

## Data Source

Phase 1 uses **`MockAgendaRepository`** which returns hard-coded sample data matching the expected response shape:

```json
{
  "date": "2026-03-12",
  "meals": [
    { "id": 1, "name": "Meal 1", "title": "Mince taco bowl", "protein": 55, "carbs": 8, "fat": 30 }
  ],
  "workout": {
    "title": "Walk + Dumbbells",
    "items": [{ "name": "Walk", "value": "40 mins" }]
  },
  "targets": { "protein": 180, "carbs": 30, "fat": 110, "waterLitres": 4 }
}
```

When the `get_today_agenda` Supabase RPC is available, swap `MockAgendaRepository` for a live implementation of `AgendaRepository` that calls `RetrofitClient.apiService.getTodayAgenda(...)`.

---

## Screens

### Login Screen
- Email + password fields
- Sign In button (shows loading spinner)
- Inline error messages

### Today Screen
- **Meals Card** — lists each meal with name, title, and macros (P/C/F)
- **Workout Card** — workout title and exercise list
- **Targets Card** — daily protein / carbs / fat / water targets
- Sign out button in the top bar

---

## Future Phases

| Phase | Features |
|---|---|
| 2 | Mark meal/workout completed, water tracking |
| 3 | Push notifications, shopping list, recipe view |
