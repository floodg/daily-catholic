package com.joesketo.app.ui.today

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.joesketo.app.data.models.TodayAgenda
import com.joesketo.app.data.repository.AgendaRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class TodayUiState {
    data object Loading : TodayUiState()
    data class Success(val agenda: TodayAgenda) : TodayUiState()
    data class Error(val message: String) : TodayUiState()
}

class TodayViewModel(
    private val agendaRepository: AgendaRepository,
    private val accessToken: String
) : ViewModel() {

    private val _uiState = MutableStateFlow<TodayUiState>(TodayUiState.Loading)
    val uiState: StateFlow<TodayUiState> = _uiState.asStateFlow()

    init {
        loadAgenda()
    }

    fun loadAgenda() {
        viewModelScope.launch {
            _uiState.value = TodayUiState.Loading
            try {
                val agenda = agendaRepository.getTodayAgenda(accessToken)
                _uiState.value = TodayUiState.Success(agenda)
            } catch (e: Exception) {
                _uiState.value = TodayUiState.Error(
                    e.message ?: "Failed to load today's agenda."
                )
            }
        }
    }

    class Factory(
        private val agendaRepository: AgendaRepository,
        private val accessToken: String
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return TodayViewModel(agendaRepository, accessToken) as T
        }
    }
}
