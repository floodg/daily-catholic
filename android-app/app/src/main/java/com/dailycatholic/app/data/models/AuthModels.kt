package com.dailycatholic.app.data.models

import com.google.gson.annotations.SerializedName

data class LoginRequest(
    val email: String,
    val password: String,
)

data class LoginResponse(
    @SerializedName("access_token") val accessToken: String,
    @SerializedName("token_type") val tokenType: String,
    @SerializedName("expires_in") val expiresIn: Int,
    @SerializedName("refresh_token") val refreshToken: String,
    val user: SupabaseUser?,
)

data class SupabaseUser(
    val id: String,
    val email: String?,
)

data class AuthUserResponse(
    val id: String,
    val email: String?,
)

data class SupabaseAuthErrorBody(
    val error: String?,
    @SerializedName("error_description") val errorDescription: String?,
    @SerializedName("msg") val msg: String?,
)
