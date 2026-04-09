package com.dailycatholic.app.data.repository

import com.dailycatholic.app.data.api.RetrofitClient
import com.dailycatholic.app.data.models.FiatDayDto
import com.dailycatholic.app.data.models.FiatUpsertDto
import com.dailycatholic.app.domain.DailyEntry
import com.dailycatholic.app.domain.addDays
import com.dailycatholic.app.domain.computeBonusScore
import com.dailycatholic.app.domain.computeScore
import com.dailycatholic.app.domain.getSectionsForDate
import com.dailycatholic.app.domain.maxScoreForSections
import com.dailycatholic.app.domain.startOfWeekMonday
import com.dailycatholic.app.domain.toISODate
import com.dailycatholic.app.domain.toChecksMap

class FiatRepository {

    private val api get() = RetrofitClient.apiService

    suspend fun fetchWeekRange(startIso: String, endIso: String): List<FiatDayDto> =
        api.listFiatDailyEntries(dayGte = "gte.$startIso", dayLte = "lte.$endIso")

    suspend fun upsertDay(userId: String, entry: DailyEntry, score: Int, maxScore: Int, bonusScore: Int) {
        api.upsertFiatDailyEntry(
            listOf(
                FiatUpsertDto(
                    userId = userId,
                    day = entry.date,
                    checks = entry.toChecksMap(),
                    score = score,
                    maxScore = maxScore,
                    bonusScore = bonusScore,
                ),
            ),
        )
    }

    suspend fun getCurrentUserId(): String = api.getUser().id

    fun currentWeekBounds(): Pair<String, String> {
        val mon = startOfWeekMonday()
        val sun = addDays(mon, 6)
        return toISODate(mon) to toISODate(sun)
    }
}
