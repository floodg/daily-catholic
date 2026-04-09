package com.dailycatholic.app.ui.dashboard

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dailycatholic.app.data.models.KitchenScanImageDto
import com.dailycatholic.app.data.models.PlannedMealDto
import com.dailycatholic.app.domain.todayIso
import com.dailycatholic.app.ui.theme.AppBg
import com.dailycatholic.app.ui.theme.AppBorderGold
import com.dailycatholic.app.ui.theme.AppSurface
import com.dailycatholic.app.ui.theme.AuthErrorText
import com.dailycatholic.app.ui.theme.Gold
import com.dailycatholic.app.ui.theme.Parchment
import com.dailycatholic.app.ui.theme.SacredGreen
import com.dailycatholic.app.ui.theme.TextMuted
import com.dailycatholic.app.ui.theme.TextSubtle
import java.text.SimpleDateFormat
import java.io.ByteArrayOutputStream
import java.util.Calendar
import java.util.Locale

private fun headerDateAu(): String {
    val cal = Calendar.getInstance()
    return SimpleDateFormat("EEEE, d MMMM yyyy", Locale("en", "AU")).format(cal.time)
}

private fun formatDurationMs(ms: Long): String {
    val totalMinutes = (ms / 60000).toInt()
    val hours = totalMinutes / 60
    val minutes = totalMinutes % 60
    return if (hours == 0) "${minutes}m" else "${hours}h ${minutes}m"
}

private fun formatDistanceM(m: Double): String =
    if (m >= 1000) String.format(Locale.US, "%.2f km", m / 1000.0)
    else "${m.toInt()} m"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel,
    kitchenScanViewModel: KitchenScanViewModel = viewModel(factory = KitchenScanViewModel.Factory()),
    onSignOut: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val scanState by kitchenScanViewModel.state.collectAsStateWithLifecycle()
    val summary = viewModel.walkSummary()
    val context = LocalContext.current
    val scanImages = remember { mutableStateListOf<KitchenScanImageDto>() }

    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bitmap: Bitmap? ->
        if (bitmap != null && scanImages.size < 3) {
            scanImages.add(
                KitchenScanImageDto(
                    mimeType = "image/jpeg",
                    base64 = bitmapToBase64(bitmap),
                )
            )
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            cameraLauncher.launch(null)
        }
    }

    val galleryLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(3)
    ) { uris ->
        if (uris.isNotEmpty()) {
            val remaining = 3 - scanImages.size
            uris.take(remaining).forEach { uri ->
                val base64 = uriToBase64(context, uri.toString())
                if (base64 != null) {
                    scanImages.add(KitchenScanImageDto(mimeType = "image/jpeg", base64 = base64))
                }
            }
        }
    }

    Scaffold(
        containerColor = AppBg,
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Text("Dashboard", style = MaterialTheme.typography.titleMedium, color = Parchment)
                },
                actions = {
                    TextButton(onClick = onSignOut) {
                        Text("Sign out", color = TextMuted, style = MaterialTheme.typography.labelMedium)
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(containerColor = AppBg),
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            Text("Dashboard", style = MaterialTheme.typography.labelSmall, color = Gold.copy(alpha = 0.85f))
            Text(
                "Today's Plan",
                style = MaterialTheme.typography.headlineSmall,
                color = Parchment,
            )
            Text(
                headerDateAu(),
                style = MaterialTheme.typography.bodyMedium,
                color = TextMuted,
                modifier = Modifier.padding(bottom = 16.dp),
            )
            state.error?.let { err ->
                Text(
                    err,
                    style = MaterialTheme.typography.bodySmall,
                    color = AuthErrorText,
                    modifier = Modifier.padding(bottom = 8.dp),
                )
            }

            AppCard(title = "🍽️ Meals") {
                when {
                    state.loadingMeals -> Text("Loading…", color = TextSubtle, style = MaterialTheme.typography.bodySmall)
                    state.plannedMeals.isEmpty() -> EmptyMealsHint()
                    else -> {
                        state.plannedMeals.forEach { pm ->
                            MealCard(
                                pm = pm,
                                busy = state.mealActionId == pm.id,
                                onEaten = { viewModel.markEaten(pm.id) },
                                onSkip = { viewModel.skipMeal(pm.id) },
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            AppCard(title = "💪 Workouts & walking") {
                Text(
                    "Workout schedule is stored in the browser when you use the website. Synced walks from Oval Walker appear below.",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextMuted,
                    modifier = Modifier.padding(bottom = 12.dp),
                )
                when {
                    state.loadingWalks -> Text("Loading synced walks…", color = TextSubtle, style = MaterialTheme.typography.bodySmall)
                    state.walkSessions.isEmpty() -> Text(
                        "No synced walks yet. Record a walk in Oval Walker and sync to see it here.",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSubtle,
                    )
                    else -> {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            StatChip("Sessions", "${summary.totalSessions}", Modifier.weight(1f))
                            StatChip("Steps", summary.totalSteps.toString(), Modifier.weight(1f))
                            StatChip("Distance", formatDistanceM(summary.totalDistanceMeters), Modifier.weight(1f))
                            StatChip("Active", formatDurationMs(summary.totalActiveMs), Modifier.weight(1f))
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        state.walkSessions.forEach { session ->
                            val d = session.startedAt.take(10)
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(AppBg, RoundedCornerShape(10.dp))
                                    .border(1.dp, AppBorderGold.copy(alpha = 0.25f), RoundedCornerShape(10.dp))
                                    .padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Column {
                                    Text(
                                        d,
                                        style = MaterialTheme.typography.titleMedium,
                                        color = Parchment,
                                    )
                                    Text(
                                        "${formatDurationMs(session.activeMs)} active · ${session.totalLaps} laps · ${session.ovalName}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = TextMuted,
                                    )
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text(
                                        "${session.totalSteps} steps",
                                        style = MaterialTheme.typography.titleMedium,
                                        color = Parchment,
                                    )
                                    Text(
                                        formatDistanceM(session.totalDistanceMeters),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = TextMuted,
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            AppCard(title = "📸 Kitchen scan") {
                Text(
                    "Capture up to 3 photos of your fridge/cupboard. The AI suggests missing or low ingredients for this week's meals.",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextMuted,
                )
                Spacer(modifier = Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = {
                            if (scanImages.size < 3) {
                                when (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)) {
                                    PackageManager.PERMISSION_GRANTED -> {
                                        cameraLauncher.launch(null)
                                    }
                                    else -> {
                                        permissionLauncher.launch(Manifest.permission.CAMERA)
                                    }
                                }
                            }
                        },
                        enabled = scanImages.size < 3 && !scanState.analyzing && !scanState.applying,
                        colors = ButtonDefaults.buttonColors(containerColor = Gold.copy(alpha = 0.25f), contentColor = Gold),
                    ) { Text("Take photo") }
                    OutlinedButton(
                        onClick = {
                            galleryLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                        },
                        enabled = scanImages.size < 3 && !scanState.analyzing && !scanState.applying,
                    ) { Text("Choose photos", color = TextMuted) }
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    "${scanImages.size}/3 selected",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSubtle,
                )
                Spacer(modifier = Modifier.height(10.dp))
                Button(
                    onClick = { kitchenScanViewModel.analyze(scanImages.toList()) },
                    enabled = scanImages.isNotEmpty() && !scanState.analyzing && !scanState.applying,
                    colors = ButtonDefaults.buttonColors(containerColor = Gold.copy(alpha = 0.25f), contentColor = Gold),
                ) {
                    if (scanState.analyzing) {
                        CircularProgressIndicator(Modifier.size(18.dp), color = Gold, strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                        Text("Analysing your kitchen…")
                    } else {
                        Text("Analyse kitchen")
                    }
                }

                scanState.error?.let { err ->
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(err, style = MaterialTheme.typography.bodySmall, color = AuthErrorText)
                }
                scanState.summary?.let { summaryText ->
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(summaryText, style = MaterialTheme.typography.bodySmall, color = TextMuted)
                }

                val reviewItems = (scanState.missing + scanState.low).distinct()
                if (reviewItems.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    HorizontalDivider(color = AppBorderGold.copy(alpha = 0.2f))
                    Spacer(modifier = Modifier.height(10.dp))
                    Text("Review before add", style = MaterialTheme.typography.titleMedium, color = Parchment)
                    Spacer(modifier = Modifier.height(8.dp))
                    reviewItems.forEach { name ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(name, style = MaterialTheme.typography.bodyMedium, color = Parchment)
                            OutlinedButton(onClick = { kitchenScanViewModel.toggleSelection(name) }) {
                                Text(
                                    if (scanState.selected.contains(name)) "Selected" else "Select",
                                    color = TextMuted
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                    }
                    if (scanState.unknownCount > 0) {
                        Text(
                            "Couldn't assess ${scanState.unknownCount} ingredient(s).",
                            style = MaterialTheme.typography.bodySmall,
                            color = TextSubtle,
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { kitchenScanViewModel.applySelected() },
                            enabled = scanState.selected.isNotEmpty() && !scanState.applying,
                            colors = ButtonDefaults.buttonColors(containerColor = Gold.copy(alpha = 0.25f), contentColor = Gold),
                        ) { Text(if (scanState.applying) "Adding..." else "Confirm items") }
                        OutlinedButton(
                            onClick = { kitchenScanViewModel.clearReview() },
                            enabled = !scanState.applying,
                        ) { Text("Clear review", color = TextMuted) }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))
                OutlinedButton(
                    onClick = { kitchenScanViewModel.refreshOpenItems() },
                    enabled = !scanState.loadingOpenItems,
                ) {
                    Text("Refresh open shopping items", color = TextMuted)
                }
                if (scanState.openItems.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(10.dp))
                    scanState.openItems.take(5).forEach { row ->
                        Text("• ${row.ingredientName}", style = MaterialTheme.typography.bodySmall, color = TextMuted)
                    }
                }
            }
        }
    }
}

private fun bitmapToBase64(bitmap: Bitmap): String {
    val stream = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.JPEG, 80, stream)
    return Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
}

private fun uriToBase64(context: android.content.Context, uriString: String): String? {
    return try {
        val uri = android.net.Uri.parse(uriString)
        val input = context.contentResolver.openInputStream(uri) ?: return null
        val bitmap = BitmapFactory.decodeStream(input) ?: return null
        input.close()
        bitmapToBase64(bitmap)
    } catch (_: Exception) {
        null
    }
}

@Composable
private fun EmptyMealsHint() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(AppBg, RoundedCornerShape(10.dp))
            .border(1.dp, AppBorderGold.copy(alpha = 0.2f), RoundedCornerShape(10.dp))
            .padding(14.dp),
    ) {
        Text("Nothing on the menu yet", style = MaterialTheme.typography.titleMedium, color = Parchment)
        Text(
            "Add meals to your Weekly Plan on the Daily Catholic website.",
            style = MaterialTheme.typography.bodySmall,
            color = TextMuted,
        )
    }
}

@Composable
private fun AppCard(title: String, content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, AppBorderGold.copy(alpha = 0.25f), RoundedCornerShape(12.dp))
            .background(AppSurface, RoundedCornerShape(12.dp))
            .padding(14.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, color = Parchment, modifier = Modifier.padding(bottom = 10.dp))
        content()
    }
}

@Composable
private fun MealCard(
    pm: PlannedMealDto,
    busy: Boolean,
    onEaten: () -> Unit,
    onSkip: () -> Unit,
) {
    val meal = pm.meals
    val status = pm.status ?: "planned"
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(AppBg, RoundedCornerShape(10.dp))
            .border(1.dp, AppBorderGold.copy(alpha = 0.2f), RoundedCornerShape(10.dp))
            .padding(12.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column(Modifier.weight(1f)) {
                Text(
                    pm.mealSlot.replaceFirstChar { it.titlecase(Locale.getDefault()) },
                    style = MaterialTheme.typography.labelSmall,
                    color = Gold,
                )
                Text(
                    meal?.name ?: "Meal",
                    style = MaterialTheme.typography.titleMedium,
                    color = Parchment,
                )
                meal?.mealIngredients?.sortedBy { it.sortOrder ?: 0 }?.forEach { ing ->
                    Text(
                        "• ${formatIngredientLine(ing)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextMuted,
                    )
                }
                pm.notes?.takeIf { it.isNotBlank() }?.let { n ->
                    Text(n, style = MaterialTheme.typography.bodySmall, color = TextMuted)
                }
            }
            when (status) {
                "completed" -> StatusPill("✓ Eaten", SacredGreen)
                "skipped" -> StatusPill("Skipped", TextMuted)
            }
        }
        if (status == "planned") {
            Spacer(modifier = Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onEaten,
                    enabled = !busy,
                    colors = ButtonDefaults.buttonColors(containerColor = Gold.copy(alpha = 0.25f), contentColor = Gold),
                ) {
                    if (busy) {
                        CircularProgressIndicator(Modifier.size(18.dp), color = Gold, strokeWidth = 2.dp)
                    } else {
                        Text("✓ Mark eaten")
                    }
                }
                OutlinedButton(onClick = onSkip, enabled = !busy) {
                    Text("Skip", color = TextMuted)
                }
            }
        }
    }
}

@Composable
private fun StatusPill(text: String, color: Color) {
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        color = color,
        modifier = Modifier
            .border(1.dp, color.copy(alpha = 0.4f), RoundedCornerShape(100.dp))
            .background(color.copy(alpha = 0.12f), RoundedCornerShape(100.dp))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
private fun StatChip(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .background(AppBg, RoundedCornerShape(10.dp))
            .border(1.dp, AppBorderGold.copy(alpha = 0.2f), RoundedCornerShape(10.dp))
            .padding(10.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = TextMuted)
        Text(value, style = MaterialTheme.typography.titleMedium, color = Parchment)
    }
}
