package com.joesketo.app.data.models

import com.google.gson.annotations.SerializedName

data class TodayAgenda(
    val date: String,
    val meals: List<Meal>,
    val workout: Workout,
    val targets: Targets
)

data class Meal(
    val id: Int,
    val name: String,
    val title: String,
    val protein: Int,
    val carbs: Int,
    val fat: Int
)

data class Workout(
    val title: String,
    val items: List<WorkoutItem>
)

data class WorkoutItem(
    val name: String,
    val value: String
)

data class Targets(
    val protein: Int,
    val carbs: Int,
    val fat: Int,
    @SerializedName("waterLitres") val waterLitres: Double
)
