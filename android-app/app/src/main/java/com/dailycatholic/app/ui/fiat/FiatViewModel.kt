package com.dailycatholic.app.ui.fiat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.dailycatholic.app.data.models.FiatDayDto
import com.dailycatholic.app.data.repository.FiatRepository
import com.dailycatholic.app.domain.DailyEntry
import com.dailycatholic.app.domain.addDays
import com.dailycatholic.app.domain.computeBonusScore
import com.dailycatholic.app.domain.computeScore
import com.dailycatholic.app.domain.emptyEntry
import com.dailycatholic.app.domain.getSectionsForDate
import com.dailycatholic.app.domain.maxScoreForSections
import com.dailycatholic.app.domain.mergeEntryFromChecks
import com.dailycatholic.app.domain.startOfWeekMonday
import com.dailycatholic.app.domain.toChecksMap
import com.dailycatholic.app.domain.toISODate
import com.dailycatholic.app.domain.todayIso
import com.dailycatholic.app.domain.withToggled
import com.google.gson.Gson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class FiatUiState(
    val loading: Boolean = true,
    val dataReady: Boolean = false,
    val userId: String? = null,
    val viewDate: String,
    val entry: DailyEntry,
    /** ISO date -> row from server (or locally updated) */
    val weekByDay: Map<String, FiatDayDto> = emptyMap(),
    val saveError: String? = null,
    val fiatOn: Boolean = true,
)

class FiatViewModel(
    private val repository: FiatRepository,
) : ViewModel() {

    private val gson = Gson()

    private val _state = MutableStateFlow(
        FiatUiState(viewDate = todayIso(), entry = emptyEntry(todayIso())),
    )
    val state: StateFlow<FiatUiState> = _state.asStateFlow()

    init {
        reloadWeek()
    }

    fun reloadWeek() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, saveError = null, dataReady = false) }
            try {
                val uid = repository.getCurrentUserId()
                val (start, end) = repository.currentWeekBounds()
                val rows = repository.fetchWeekRange(start, end)
                val map = rows.associateBy { it.day }
                val today = todayIso()
                val entry = mergeEntryFromChecks(today, map[today]?.checks)
                _state.update {
                    it.copy(
                        loading = false,
                        dataReady = true,
                        userId = uid,
                        viewDate = today,
                        entry = entry,
                        weekByDay = map,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        dataReady = true,
                        userId = null,
                        saveError = e.message,
                    )
                }
            }
        }
    }

    fun setFiatOn(on: Boolean) {
        _state.update { it.copy(fiatOn = on) }
    }

    fun pickDay(iso: String) {
        val s = _state.value
        if (iso == s.viewDate || s.userId == null || !s.dataReady) return
        viewModelScope.launch {
            _state.update { it.copy(saveError = null) }
            try {
                val sections = getSectionsForDate(s.viewDate)
                val max = maxScoreForSections(sections)
                repository.upsertDay(
                    s.userId,
                    s.entry,
                    computeScore(s.entry, sections),
                    max,
                    computeBonusScore(s.entry, sections),
                )
                val updatedMap = s.weekByDay.toMutableMap().apply {
                    put(s.viewDate, entryToDto(s.entry))
                }
                val destEntry = mergeEntryFromChecks(iso, updatedMap[iso]?.checks)
                _state.update {
                    it.copy(
                        weekByDay = updatedMap,
                        viewDate = iso,
                        entry = destEntry,
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(saveError = e.message) }
            }
        }
    }

    fun toggleCheck(key: String) {
        val s = _state.value
        if (s.userId == null || !s.dataReady) return
        viewModelScope.launch {
            _state.update { it.copy(saveError = null) }
            try {
                val next = s.entry.withToggled(key)
                val sections = getSectionsForDate(s.viewDate)
                val sc = computeScore(next, sections)
                val mx = maxScoreForSections(sections)
                val bsc = computeBonusScore(next, sections)
                repository.upsertDay(s.userId, next, sc, mx, bsc)
                val row = entryToDto(next)
                val newMap = s.weekByDay.toMutableMap().apply { put(s.viewDate, row) }
                _state.update { it.copy(entry = next, weekByDay = newMap) }
            } catch (e: Exception) {
                _state.update { it.copy(saveError = e.message) }
            }
        }
    }

    private fun entryToDto(entry: DailyEntry): FiatDayDto {
        val sections = getSectionsForDate(entry.date)
        return FiatDayDto(
            day = entry.date,
            checks = gson.toJsonTree(entry.toChecksMap()),
            score = computeScore(entry, sections),
            maxScore = maxScoreForSections(sections),
            bonusScore = computeBonusScore(entry, sections),
        )
    }

    /** Build week strip Mon–Sun for current calendar week. */
    fun weekSlotsForUi(): List<WeekSlotUi> {
        val s = _state.value
        val mon = startOfWeekMonday()
        val labels = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
        return (0 until 7).map { i ->
            val cal = addDays(mon, i)
            val iso = toISODate(cal)
            val row = s.weekByDay[iso]
            val sections = getSectionsForDate(iso)
            val max = row?.maxScore ?: maxScoreForSections(sections)
            val sc = row?.score ?: 0
            val bonus = row?.bonusScore ?: 0
            WeekSlotUi(iso = iso, label = labels[i], max = max, score = sc, bonus = bonus)
        }
    }

    data class WeekSlotUi(
        val iso: String,
        val label: String,
        val max: Int,
        val score: Int,
        val bonus: Int,
    )

    class Factory : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return FiatViewModel(FiatRepository()) as T
        }
    }
}
