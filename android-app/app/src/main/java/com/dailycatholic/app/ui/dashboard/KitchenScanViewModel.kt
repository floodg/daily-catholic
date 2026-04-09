package com.dailycatholic.app.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.dailycatholic.app.data.models.KitchenScanImageDto
import com.dailycatholic.app.data.models.ShoppingListRowDto
import com.dailycatholic.app.data.repository.KitchenScanRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class KitchenScanUiState(
    val analyzing: Boolean = false,
    val applying: Boolean = false,
    val loadingOpenItems: Boolean = false,
    val missing: List<String> = emptyList(),
    val low: List<String> = emptyList(),
    val sufficient: List<String> = emptyList(),
    val unknownCount: Int = 0,
    val selected: Set<String> = emptySet(),
    val summary: String? = null,
    val openItems: List<ShoppingListRowDto> = emptyList(),
    val error: String? = null,
)

class KitchenScanViewModel(
    private val repository: KitchenScanRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(KitchenScanUiState())
    val state: StateFlow<KitchenScanUiState> = _state.asStateFlow()

    fun analyze(images: List<KitchenScanImageDto>) {
        if (images.isEmpty()) return
        viewModelScope.launch {
            _state.update {
                it.copy(
                    analyzing = true,
                    error = null,
                    summary = null,
                )
            }
            try {
                val result = repository.analyze(images)
                val selected = (result.missing + result.low).toSet()
                _state.update {
                    it.copy(
                        analyzing = false,
                        missing = result.missing,
                        low = result.low,
                        sufficient = result.sufficient,
                        unknownCount = result.unknownCount,
                        selected = selected,
                        summary = result.message,
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(analyzing = false, error = e.message ?: "Failed to analyse photos.") }
            }
        }
    }

    fun toggleSelection(name: String) {
        _state.update { current ->
            val next = current.selected.toMutableSet()
            if (next.contains(name)) next.remove(name) else next.add(name)
            current.copy(selected = next)
        }
    }

    fun clearReview() {
        _state.update {
            it.copy(
                missing = emptyList(),
                low = emptyList(),
                sufficient = emptyList(),
                unknownCount = 0,
                selected = emptySet(),
            )
        }
    }

    fun applySelected() {
        val names = state.value.selected.toList()
        if (names.isEmpty()) return
        viewModelScope.launch {
            _state.update { it.copy(applying = true, error = null) }
            try {
                val result = repository.apply(names)
                val unknown = state.value.unknownCount
                _state.update {
                    it.copy(
                        applying = false,
                        summary = "Added ${result.added} item(s) · ${result.skipped} already on list · couldn't assess $unknown",
                        missing = emptyList(),
                        low = emptyList(),
                        sufficient = emptyList(),
                        unknownCount = 0,
                        selected = emptySet(),
                    )
                }
                refreshOpenItems()
            } catch (e: Exception) {
                _state.update { it.copy(applying = false, error = e.message ?: "Failed to apply suggestions.") }
            }
        }
    }

    fun refreshOpenItems() {
        viewModelScope.launch {
            _state.update { it.copy(loadingOpenItems = true) }
            try {
                val rows = repository.openShoppingItems()
                _state.update { it.copy(loadingOpenItems = false, openItems = rows) }
            } catch (e: Exception) {
                _state.update { it.copy(loadingOpenItems = false, error = e.message ?: "Failed to load shopping list.") }
            }
        }
    }

    class Factory : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return KitchenScanViewModel(KitchenScanRepository()) as T
        }
    }
}
