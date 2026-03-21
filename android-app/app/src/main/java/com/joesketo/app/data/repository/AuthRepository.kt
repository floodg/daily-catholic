package com.joesketo.app.data.repository

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.joesketo.app.data.api.RetrofitClient
import com.joesketo.app.data.models.LoginRequest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.authDataStore: DataStore<Preferences> by preferencesDataStore(name = "auth")

class AuthRepository(private val context: Context) {

    companion object {
        private val ACCESS_TOKEN_KEY = stringPreferencesKey("access_token")
        private val REFRESH_TOKEN_KEY = stringPreferencesKey("refresh_token")
    }

    /** Emit the stored access token, or null if not signed in. */
    val accessToken: Flow<String?> = context.authDataStore.data.map { prefs ->
        prefs[ACCESS_TOKEN_KEY]
    }

    /**
     * Attempt sign-in against Supabase Auth.
     * On success the tokens are persisted to DataStore.
     * Returns the access token string.
     */
    suspend fun signIn(email: String, password: String): String {
        val response = RetrofitClient.apiService.signIn(
            request = LoginRequest(email = email, password = password)
        )
        context.authDataStore.edit { prefs ->
            prefs[ACCESS_TOKEN_KEY] = response.accessToken
            prefs[REFRESH_TOKEN_KEY] = response.refreshToken
        }
        return response.accessToken
    }

    /** Clear stored session tokens (sign out). */
    suspend fun signOut() {
        context.authDataStore.edit { prefs ->
            prefs.remove(ACCESS_TOKEN_KEY)
            prefs.remove(REFRESH_TOKEN_KEY)
        }
    }
}
