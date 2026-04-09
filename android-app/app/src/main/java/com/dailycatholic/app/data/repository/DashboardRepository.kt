package com.dailycatholic.app.data.repository

import com.dailycatholic.app.data.api.RetrofitClient
import com.dailycatholic.app.data.models.MarkMealEatenRpcBody
import com.dailycatholic.app.data.models.PlannedMealDto
import com.dailycatholic.app.data.models.WalkSessionDto
import com.google.gson.JsonObject

class DashboardRepository {

    private val api get() = RetrofitClient.apiService

    companion object {
        const val PLANNED_MEAL_SELECT =
            "id,meal_id,planned_date,meal_slot,status,notes,servings,meals(name,meal_ingredients(name,quantity,unit,quantity_label,sort_order))"

        const val WALK_SELECT =
            "id,started_at,ended_at,elapsed_ms,active_ms,paused_ms,total_steps,total_laps,lap_distance_meters,total_distance_meters,avg_pace_sec_per_km,avg_speed_kmh,oval_name"
    }

    suspend fun getUserId(): String = api.getUser().id

    suspend fun plannedMealsForDate(isoDate: String): List<PlannedMealDto> =
        api.listPlannedMealsForDate(
            select = PLANNED_MEAL_SELECT,
            plannedDateEq = "eq.$isoDate",
        )

    suspend fun markMealEaten(plannedMealId: String, userId: String) {
        val result = api.markMealEaten(MarkMealEatenRpcBody(plannedMealId, userId))
        if (!result.has("error")) return
        val el = result.get("error") ?: return
        if (el.isJsonNull) return
        val err = if (el.isJsonPrimitive && el.asJsonPrimitive.isString) el.asString else el.toString()
        if (err != "already_eaten") throw IllegalStateException(err)
    }

    suspend fun skipPlannedMeal(plannedMealId: String) {
        val body = JsonObject().apply { addProperty("status", "skipped") }
        api.patchPlannedMeals(idEq = "eq.$plannedMealId", body = body)
    }

    suspend fun recentWalkSessions(limit: Int = 10): List<WalkSessionDto> =
        api.listWalkSessions(select = WALK_SELECT, limit = limit)
}
