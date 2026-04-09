package com.dailycatholic.app.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.dailycatholic.app.data.models.MealIngredientDto
import com.dailycatholic.app.data.models.PlannedMealDto
import com.dailycatholic.app.data.models.WalkSessionDto
import com.dailycatholic.app.data.repository.DashboardRepository
import com.dailycatholic.app.domain.todayIso
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private val mealSlotOrder = mapOf(
    "breakfast" to 0,
    "lunch" to 1,
    "dinner" to 2,
    "snack" to 3,
)

data class DashboardUiState(
    val loadingMeals: Boolean = true,
    val loadingWalks: Boolean = true,
    val userId: String? = null,
    val todayIso: String = todayIso(),
    val plannedMeals: List<PlannedMealDto> = emptyList(),
    val walkSessions: List<WalkSessionDto> = emptyList(),
    val error: String? = null,
    val mealActionId: String? = null,
)

class DashboardViewModel(
    private val repository: DashboardRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(DashboardUiState())
    val state: StateFlow<DashboardUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        val today = todayIso()
        viewModelScope.launch {
            _state.update {
                it.copy(
                    loadingMeals = true,
                    loadingWalks = true,
                    error = null,
                    todayIso = today,
                )
            }
            try {
                val uid = repository.getUserId()
                _state.update { it.copy(userId = uid) }
            } catch (_: Exception) {
                _state.update { it.copy(userId = null) }
            }
            launch {
                try {
                    val meals = repository.plannedMealsForDate(today)
                        .sortedBy { m -> mealSlotOrder[m.mealSlot] ?: 99 }
                    _state.update { it.copy(plannedMeals = meals, loadingMeals = false) }
                } catch (e: Exception) {
                    _state.update { it.copy(loadingMeals = false, error = e.message) }
                }
            }
            launch {
                try {
                    val walks = repository.recentWalkSessions(limit = 10)
                    _state.update { it.copy(walkSessions = walks, loadingWalks = false) }
                } catch (e: Exception) {
                    _state.update { it.copy(loadingWalks = false, error = e.message) }
                }
            }
        }
    }

    fun markEaten(plannedMealId: String) {
        val uid = _state.value.userId ?: return
        viewModelScope.launch {
            _state.update { it.copy(mealActionId = plannedMealId, error = null) }
            try {
                repository.markMealEaten(plannedMealId, uid)
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message) }
            } finally {
                _state.update { it.copy(mealActionId = null) }
            }
        }
    }

    fun skipMeal(plannedMealId: String) {
        viewModelScope.launch {
            _state.update { it.copy(mealActionId = plannedMealId, error = null) }
            try {
                repository.skipPlannedMeal(plannedMealId)
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message) }
            } finally {
                _state.update { it.copy(mealActionId = null) }
            }
        }
    }

    fun walkSummary(): WalkSummary {
        val s = _state.value.walkSessions
        return WalkSummary(
            totalSessions = s.size,
            totalSteps = s.sumOf { it.totalSteps },
            totalDistanceMeters = s.sumOf { it.totalDistanceMeters },
            totalActiveMs = s.sumOf { it.activeMs },
        )
    }

    data class WalkSummary(
        val totalSessions: Int,
        val totalSteps: Long,
        val totalDistanceMeters: Double,
        val totalActiveMs: Long,
    )

    class Factory : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return DashboardViewModel(DashboardRepository()) as T
        }
    }
}

fun formatIngredientLine(ing: MealIngredientDto): String {
    val q = when {
        ing.quantity != null && ing.unit != null -> "${ing.quantity} ${ing.unit}"
        !ing.quantityLabel.isNullOrBlank() -> ing.quantityLabel
        else -> null
    }
    return if (q != null) "$q ${ing.name}" else ing.name
}
