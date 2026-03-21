package com.joesketo.app.data.repository

import com.joesketo.app.data.models.TodayAgenda

/** Contract for fetching today's agenda data. */
interface AgendaRepository {
    suspend fun getTodayAgenda(accessToken: String): TodayAgenda
}
