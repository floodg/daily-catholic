package com.dailycatholic.app.data.models

import com.google.gson.JsonElement
import com.google.gson.annotations.SerializedName

data class FiatDayDto(
    val day: String,
    val checks: JsonElement?,
    val score: Int?,
    @SerializedName("max_score") val maxScore: Int?,
    @SerializedName("bonus_score") val bonusScore: Int?,
)

data class FiatUpsertDto(
    @SerializedName("user_id") val userId: String,
    val day: String,
    val checks: Map<String, Boolean>,
    val score: Int,
    @SerializedName("max_score") val maxScore: Int,
    @SerializedName("bonus_score") val bonusScore: Int,
)

data class MealIngredientDto(
    val id: String?,
    val name: String,
    val quantity: Double?,
    val unit: String?,
    @SerializedName("quantity_label") val quantityLabel: String?,
    @SerializedName("sort_order") val sortOrder: Int?,
)

data class MealEmbedDto(
    val id: String?,
    val name: String?,
    @SerializedName("meal_ingredients") val mealIngredients: List<MealIngredientDto>? = null,
)

data class PlannedMealDto(
    val id: String,
    @SerializedName("meal_id") val mealId: String,
    @SerializedName("planned_date") val plannedDate: String,
    @SerializedName("meal_slot") val mealSlot: String,
    val status: String?,
    val notes: String?,
    val servings: Int?,
    val meals: MealEmbedDto?,
)

data class WalkSessionDto(
    val id: String,
    @SerializedName("started_at") val startedAt: String,
    @SerializedName("ended_at") val endedAt: String,
    @SerializedName("elapsed_ms") val elapsedMs: Long,
    @SerializedName("active_ms") val activeMs: Long,
    @SerializedName("paused_ms") val pausedMs: Long,
    @SerializedName("total_steps") val totalSteps: Long,
    @SerializedName("total_laps") val totalLaps: Int,
    @SerializedName("lap_distance_meters") val lapDistanceMeters: Double,
    @SerializedName("total_distance_meters") val totalDistanceMeters: Double,
    @SerializedName("avg_pace_sec_per_km") val avgPaceSecPerKm: Double,
    @SerializedName("avg_speed_kmh") val avgSpeedKmh: Double,
    @SerializedName("oval_name") val ovalName: String,
)

data class MarkMealEatenRpcBody(
    @SerializedName("p_planned_meal_id") val plannedMealId: String,
    @SerializedName("p_user_id") val userId: String,
)
