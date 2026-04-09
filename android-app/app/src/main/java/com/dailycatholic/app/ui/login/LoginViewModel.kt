package com.dailycatholic.app.ui.login

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.dailycatholic.app.data.models.SupabaseAuthErrorBody
import com.dailycatholic.app.data.repository.AuthRepository
import com.google.gson.Gson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException

sealed class LoginUiState {
    data object Idle : LoginUiState()
    data object Loading : LoginUiState()
    data class Success(val accessToken: String) : LoginUiState()
    data class Error(val message: String) : LoginUiState()
}

class LoginViewModel(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<LoginUiState>(LoginUiState.Idle)
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun signIn(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            _uiState.value = LoginUiState.Error("Email and password are required.")
            return
        }
        viewModelScope.launch {
            _uiState.value = LoginUiState.Loading
            try {
                val token = authRepository.signIn(email.trim(), password)
                _uiState.value = LoginUiState.Success(token)
            } catch (e: Exception) {
                _uiState.value = LoginUiState.Error(mapAuthError(e))
            }
        }
    }

    private fun mapAuthError(e: Exception): String {
        if (e is HttpException) {
            val raw = e.response()?.errorBody()?.string().orEmpty()
            val parsed = runCatching {
                Gson().fromJson(raw, SupabaseAuthErrorBody::class.java)
            }.getOrNull()
            val desc = parsed?.errorDescription?.takeIf { it.isNotBlank() }
                ?: parsed?.msg?.takeIf { it.isNotBlank() }
            if (parsed?.error == "invalid_grant" ||
                desc?.contains("Invalid login credentials", ignoreCase = true) == true
            ) {
                return "Email or password is incorrect."
            }
            if (!desc.isNullOrBlank()) return desc
        }
        return e.message?.takeIf { it.isNotBlank() }
            ?: "Sign-in failed. Please check your credentials."
    }

    class Factory(private val context: Context) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return LoginViewModel(AuthRepository(context.applicationContext)) as T
        }
    }
}
