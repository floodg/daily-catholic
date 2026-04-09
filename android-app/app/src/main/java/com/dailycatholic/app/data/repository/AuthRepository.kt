package com.dailycatholic.app.data.repository

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.dailycatholic.app.data.api.RetrofitClient
import com.dailycatholic.app.data.models.LoginRequest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.authDataStore: DataStore<Preferences> by preferencesDataStore(name = "auth")

class AuthRepository(private val context: Context) {

    companion object {
        private val ACCESS_TOKEN_KEY = stringPreferencesKey("access_token")
        private val REFRESH_TOKEN_KEY = stringPreferencesKey("refresh_token")
    }

    val accessToken: Flow<String?> = context.authDataStore.data.map { prefs ->
        prefs[ACCESS_TOKEN_KEY]
    }

    suspend fun signIn(email: String, password: String): String {
        val response = RetrofitClient.apiService.signIn(
            LoginRequest(email = email, password = password),
        )
        context.authDataStore.edit { prefs ->
            prefs[ACCESS_TOKEN_KEY] = response.accessToken
            prefs[REFRESH_TOKEN_KEY] = response.refreshToken
        }
        return response.accessToken
    }

    suspend fun signOut() {
        context.authDataStore.edit { prefs ->
            prefs.remove(ACCESS_TOKEN_KEY)
            prefs.remove(REFRESH_TOKEN_KEY)
        }
    }
}
