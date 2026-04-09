package com.dailycatholic.app.data.api

import com.dailycatholic.app.data.models.AuthUserResponse
import com.dailycatholic.app.data.models.FiatDayDto
import com.dailycatholic.app.data.models.FiatUpsertDto
import com.dailycatholic.app.data.models.LoginRequest
import com.dailycatholic.app.data.models.LoginResponse
import com.dailycatholic.app.data.models.KitchenScanAnalyzeRequestDto
import com.dailycatholic.app.data.models.KitchenScanAnalyzeResponseDto
import com.dailycatholic.app.data.models.KitchenScanApplyRequestDto
import com.dailycatholic.app.data.models.KitchenScanApplyResponseDto
import com.dailycatholic.app.data.models.MarkMealEatenRpcBody
import com.dailycatholic.app.data.models.PlannedMealDto
import com.dailycatholic.app.data.models.ShoppingListRowDto
import com.dailycatholic.app.data.models.WalkSessionDto
import com.google.gson.JsonObject
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Headers
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Query

interface SupabaseApiService {

    @POST("auth/v1/token?grant_type=password")
    suspend fun signIn(@Body request: LoginRequest): LoginResponse

    @GET("auth/v1/user")
    suspend fun getUser(): AuthUserResponse

    @GET("rest/v1/fiat_daily_entries")
    suspend fun listFiatDailyEntries(
        @Query("select") select: String = "day,checks,score,max_score,bonus_score",
        @Query("order") order: String = "day.asc",
        @Query("day") dayGte: String,
        @Query("day") dayLte: String,
    ): List<FiatDayDto>

    @POST("rest/v1/fiat_daily_entries")
    @Headers(
        "Prefer: resolution=merge-duplicates,return=minimal",
    )
    suspend fun upsertFiatDailyEntry(@Body body: List<FiatUpsertDto>)

    @GET("rest/v1/planned_meals")
    suspend fun listPlannedMealsForDate(
        @Query("select") select: String,
        @Query("planned_date") plannedDateEq: String,
        @Query("order") order: String = "meal_slot.asc",
    ): List<PlannedMealDto>

    @PATCH("rest/v1/planned_meals")
    @Headers("Prefer: return=representation")
    suspend fun patchPlannedMeals(
        @Query("id") idEq: String,
        @Body body: JsonObject,
    ): List<PlannedMealDto>

    @POST("rest/v1/rpc/mark_meal_eaten")
    suspend fun markMealEaten(@Body body: MarkMealEatenRpcBody): JsonObject

    @GET("rest/v1/walk_sessions")
    suspend fun listWalkSessions(
        @Query("select") select: String,
        @Query("order") order: String = "started_at.desc",
        @Query("limit") limit: Int = 10,
    ): List<WalkSessionDto>

    @POST("functions/v1/scan-kitchen")
    suspend fun scanKitchenAnalyze(
        @Body body: KitchenScanAnalyzeRequestDto,
    ): KitchenScanAnalyzeResponseDto

    @POST("functions/v1/scan-kitchen")
    suspend fun scanKitchenApply(
        @Body body: KitchenScanApplyRequestDto,
    ): KitchenScanApplyResponseDto

    @GET("rest/v1/shopping_list")
    suspend fun listOpenShoppingListItems(
        @Query("select") select: String = "id,ingredient_name,is_checked,source,created_at",
        @Query("is_checked") isCheckedEq: String = "eq.false",
        @Query("order") order: String = "created_at.desc",
    ): List<ShoppingListRowDto>
}
