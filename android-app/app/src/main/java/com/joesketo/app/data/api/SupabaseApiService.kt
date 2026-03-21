package com.joesketo.app.data.api

import com.joesketo.app.data.models.LoginRequest
import com.joesketo.app.data.models.LoginResponse
import com.joesketo.app.data.models.TodayAgenda
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Query

interface SupabaseApiService {

    /**
     * Supabase Auth: sign in with email + password.
     * POST /auth/v1/token?grant_type=password
     */
    @POST("auth/v1/token")
    suspend fun signIn(
        @Query("grant_type") grantType: String = "password",
        @Body request: LoginRequest
    ): LoginResponse

    /**
     * Fetch today's agenda via Supabase RPC.
     * POST /rest/v1/rpc/get_today_agenda
     *
     * Note: this RPC does not exist yet in Phase 1; the MockAgendaRepository
     * is used instead. This declaration is kept here for the live implementation.
     */
    @GET("rest/v1/rpc/get_today_agenda")
    suspend fun getTodayAgenda(
        @Header("Authorization") authorization: String
    ): TodayAgenda
}
