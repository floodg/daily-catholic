package com.joesketo.app.data.repository

import com.joesketo.app.data.models.Meal
import com.joesketo.app.data.models.Targets
import com.joesketo.app.data.models.TodayAgenda
import com.joesketo.app.data.models.Workout
import com.joesketo.app.data.models.WorkoutItem
import java.time.LocalDate

/**
 * Temporary mock implementation of [AgendaRepository] for Phase 1.
 *
 * Returns hard-coded data that matches the expected response shape until the
 * Supabase `get_today_agenda` RPC endpoint is available.
 */
class MockAgendaRepository : AgendaRepository {

    override suspend fun getTodayAgenda(accessToken: String): TodayAgenda {
        return TodayAgenda(
            date = LocalDate.now().toString(),
            meals = listOf(
                Meal(
                    id = 1,
                    name = "Meal 1",
                    title = "Mince taco bowl",
                    protein = 55,
                    carbs = 8,
                    fat = 30
                ),
                Meal(
                    id = 2,
                    name = "Meal 2",
                    title = "Grilled chicken & greens",
                    protein = 60,
                    carbs = 5,
                    fat = 20
                ),
                Meal(
                    id = 3,
                    name = "Snack",
                    title = "Boiled eggs & almonds",
                    protein = 20,
                    carbs = 3,
                    fat = 18
                )
            ),
            workout = Workout(
                title = "Walk + Dumbbells",
                items = listOf(
                    WorkoutItem(name = "Walk", value = "40 mins"),
                    WorkoutItem(name = "Dumbbell rows", value = "3 × 12"),
                    WorkoutItem(name = "Shoulder press", value = "3 × 10"),
                    WorkoutItem(name = "Bicep curls", value = "3 × 12")
                )
            ),
            targets = Targets(
                protein = 180,
                carbs = 30,
                fat = 110,
                waterLitres = 4.0
            )
        )
    }
}
