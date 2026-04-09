package com.dailycatholic.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColors = darkColorScheme(
    primary = Gold,
    onPrimary = NightTop,
    primaryContainer = GoldLight,
    secondary = SacredBlue,
    tertiary = SacredGreen,
    background = AppBg,
    onBackground = Parchment,
    surface = AppSurface,
    onSurface = Parchment,
    surfaceVariant = AppSurface,
    onSurfaceVariant = TextMuted,
    outline = AppBorderGold,
    error = AuthErrorText,
)

@Composable
fun DailyCatholicTheme(
    @Suppress("UNUSED_PARAMETER") darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = DarkColors,
        typography = AppTypography,
        content = content,
    )
}
