package com.dailycatholic.app.data.repository

import com.dailycatholic.app.data.api.RetrofitClient
import com.dailycatholic.app.data.models.KitchenScanAnalyzeRequestDto
import com.dailycatholic.app.data.models.KitchenScanAnalyzeResponseDto
import com.dailycatholic.app.data.models.KitchenScanApplyRequestDto
import com.dailycatholic.app.data.models.KitchenScanApplyResponseDto
import com.dailycatholic.app.data.models.KitchenScanImageDto
import com.dailycatholic.app.data.models.ShoppingListRowDto

class KitchenScanRepository {
    private val api get() = RetrofitClient.apiService

    suspend fun analyze(images: List<KitchenScanImageDto>): KitchenScanAnalyzeResponseDto =
        api.scanKitchenAnalyze(KitchenScanAnalyzeRequestDto(images = images))

    suspend fun apply(names: List<String>): KitchenScanApplyResponseDto =
        api.scanKitchenApply(KitchenScanApplyRequestDto(names = names))

    suspend fun openShoppingItems(): List<ShoppingListRowDto> =
        api.listOpenShoppingListItems()
}
