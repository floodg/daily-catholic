package com.dailycatholic.app.ui.fiat

import android.content.Context
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.TextButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.dailycatholic.app.domain.CheckMediaKind
import com.dailycatholic.app.domain.FiatCheck
import com.dailycatholic.app.domain.FiatSection
import com.dailycatholic.app.domain.computeBonusScore
import com.dailycatholic.app.domain.computeScore
import com.dailycatholic.app.domain.getSectionsForDate
import com.dailycatholic.app.domain.getCheck
import com.dailycatholic.app.domain.maxScoreForSections
import com.dailycatholic.app.domain.toYoutubeEmbedUrl
import com.dailycatholic.app.ui.theme.AppBg
import com.dailycatholic.app.ui.theme.AppBorderGold
import com.dailycatholic.app.ui.theme.AppSurface
import com.dailycatholic.app.ui.theme.AuthErrorText
import com.dailycatholic.app.ui.theme.Gold
import com.dailycatholic.app.ui.theme.Parchment
import com.dailycatholic.app.ui.theme.SacredBlue
import com.dailycatholic.app.ui.theme.SacredGreen
import com.dailycatholic.app.ui.theme.SacredViolet
import com.dailycatholic.app.ui.theme.TextMuted
import com.dailycatholic.app.util.openInCustomTab
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import kotlin.math.min

private fun formatDateAu(iso: String): String {
    val p = iso.split("-").mapNotNull { it.toIntOrNull() }
    if (p.size != 3) return iso
    val cal = Calendar.getInstance().apply {
        set(p[0], p[1] - 1, p[2])
    }
    return SimpleDateFormat("EEEE, d MMMM yyyy", Locale("en", "AU")).format(cal.time)
}

private fun getPrompt(): String {
    val h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    return when {
        h < 9 -> "\"Receive the day — Fiat.\""
        h < 12 -> "\"Offer each hour back to Him.\""
        h < 14 -> "\"Eat with order. Body follows soul.\""
        h < 17 -> "\"Continue what remains. Nothing wasted.\""
        h < 20 -> "\"Complete the day in His will.\""
        else -> "\"Review. Give thanks. Night Fiat.\""
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FiatModeScreen(
    viewModel: FiatViewModel,
    onSignOut: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val sections = remember(state.viewDate) { getSectionsForDate(state.viewDate) }
    val maxScore = remember(sections) { maxScoreForSections(sections) }
    val score = remember(state.entry, sections) { computeScore(state.entry, sections) }
    val bonus = remember(state.entry, sections) { computeBonusScore(state.entry, sections) }
    val weekSlots = remember(state.weekByDay, state.viewDate) { viewModel.weekSlotsForUi() }
    val context = LocalContext.current

    Scaffold(
        containerColor = AppBg,
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Text(
                        "Daily Catholic",
                        style = MaterialTheme.typography.titleMedium,
                        color = Parchment,
                    )
                },
                actions = {
                    TextButton(onClick = onSignOut) {
                        Text("Sign out", style = MaterialTheme.typography.labelMedium, color = TextMuted)
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                    containerColor = AppBg,
                ),
            )
        },
    ) { padding ->
        if (state.loading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = Gold)
            }
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
        ) {
            Text(
                formatDateAu(state.viewDate),
                style = MaterialTheme.typography.labelMedium,
                color = Gold.copy(alpha = 0.85f),
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
            )
            Text(
                "Fiat Mode",
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
            )
            Text(
                "Thy will be done",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(16.dp))
            FiatToggleRow(fiatOn = state.fiatOn, onToggle = { viewModel.setFiatOn(!state.fiatOn) })
            Spacer(modifier = Modifier.height(12.dp))
            if (state.fiatOn) {
                Text(
                    getPrompt(),
                    style = MaterialTheme.typography.bodyLarge,
                    color = Parchment.copy(alpha = 0.92f),
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center,
                )
                Spacer(modifier = Modifier.height(12.dp))
            }
            ScoreRing(score = score, max = maxScore, bonus = bonus)
            Text(
                "Daily Fidelity Score",
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(8.dp))
            FidelityProgress(score = score, max = maxScore, bonus = bonus)
            Spacer(modifier = Modifier.height(8.dp))
            if (!state.dataReady) {
                Text(
                    "Loading today from server…",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextMuted,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center,
                )
            }
            state.saveError?.let { err ->
                Text(
                    err,
                    style = MaterialTheme.typography.bodySmall,
                    color = AuthErrorText,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp),
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            WeekStrip(
                slots = weekSlots,
                selected = state.viewDate,
                onPick = { viewModel.pickDay(it) },
            )
            Spacer(modifier = Modifier.height(16.dp))
            sections.forEach { sec ->
                SectionCard(
                    section = sec,
                    entry = state.entry,
                    onToggle = { viewModel.toggleCheck(it) },
                    onMedia = { media -> openFiatMedia(context, media) },
                )
                Spacer(modifier = Modifier.height(12.dp))
            }
            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

private fun openFiatMedia(context: Context, check: FiatCheck) {
    val media = check.media ?: return
    val url = when (media.kind) {
        CheckMediaKind.Youtube -> toYoutubeEmbedUrl(media.url) ?: media.url
        CheckMediaKind.External -> media.url
    }
    openInCustomTab(context, url)
}

@Composable
private fun FiatToggleRow(fiatOn: Boolean, onToggle: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "OFF",
            style = MaterialTheme.typography.labelMedium,
            color = if (!fiatOn) Gold else TextMuted,
        )
        Spacer(modifier = Modifier.width(12.dp))
        Box(
            modifier = Modifier
                .width(52.dp)
                .height(28.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(if (fiatOn) Gold.copy(alpha = 0.35f) else TextMuted.copy(alpha = 0.25f))
                .clickable(onClick = onToggle)
                .border(1.dp, Gold.copy(alpha = 0.4f), RoundedCornerShape(14.dp)),
            contentAlignment = if (fiatOn) Alignment.CenterEnd else Alignment.CenterStart,
        ) {
            Box(
                modifier = Modifier
                    .padding(horizontal = 4.dp)
                    .size(22.dp)
                    .clip(CircleShape)
                    .background(Parchment),
            )
        }
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            "FIAT MODE",
            style = MaterialTheme.typography.labelMedium,
            color = if (fiatOn) Gold else TextMuted,
        )
    }
}

@Composable
private fun ScoreRing(score: Int, max: Int, bonus: Int) {
    val pct = if (max > 0) min(1f, score.toFloat() / max.toFloat()) else 0f
    val animated by animateFloatAsState(targetValue = pct, label = "ring")
    val ringColor = when {
        bonus > 0 || animated >= 0.9f -> Gold
        animated >= 0.7f -> SacredBlue
        animated >= 0.5f -> SacredGreen
        else -> SacredViolet
    }
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier.size(128.dp),
            contentAlignment = Alignment.Center,
        ) {
            Canvas(Modifier.fillMaxSize()) {
                val stroke = 8.dp.toPx()
                val r = size.minDimension / 2 - stroke
                drawArc(
                    color = Color.White.copy(alpha = 0.05f),
                    startAngle = 0f,
                    sweepAngle = 360f,
                    useCenter = false,
                    style = Stroke(width = stroke),
                    size = Size(r * 2, r * 2),
                    topLeft = Offset(center.x - r, center.y - r),
                )
                drawArc(
                    color = ringColor,
                    startAngle = -90f,
                    sweepAngle = 360f * animated,
                    useCenter = false,
                    style = Stroke(width = stroke, cap = StrokeCap.Round),
                    size = Size(r * 2, r * 2),
                    topLeft = Offset(center.x - r, center.y - r),
                )
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    "$score",
                    style = MaterialTheme.typography.headlineSmall,
                    color = Parchment,
                    textAlign = TextAlign.Center,
                )
                Text(
                    "OF $max",
                    style = MaterialTheme.typography.labelSmall,
                    color = TextMuted,
                    textAlign = TextAlign.Center,
                )
            }
        }
        if (bonus > 0) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                "+$bonus Bonus",
                style = MaterialTheme.typography.labelSmall,
                color = Gold,
                modifier = Modifier
                    .border(1.dp, Gold.copy(alpha = 0.4f), RoundedCornerShape(4.dp))
                    .background(Gold.copy(alpha = 0.08f), RoundedCornerShape(4.dp))
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            )
            Text(
                "Mass attended ✦",
                style = MaterialTheme.typography.bodySmall,
                color = Gold.copy(alpha = 0.7f),
            )
        }
    }
}

@Composable
private fun FidelityProgress(score: Int, max: Int, bonus: Int) {
    val pct = if (max > 0) min(1f, score.toFloat() / max.toFloat()) else 0f
    Column {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(TextMuted.copy(alpha = 0.15f)),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(pct)
                    .height(6.dp)
                    .background(if (bonus > 0) Gold else SacredBlue),
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("Fidelity", style = MaterialTheme.typography.labelSmall, color = TextMuted)
            Row {
                Text(
                    "$score / $max",
                    style = MaterialTheme.typography.labelSmall,
                    color = Parchment,
                )
                if (bonus > 0) {
                    Text(
                        " · +$bonus",
                        style = MaterialTheme.typography.labelSmall,
                        color = Gold,
                    )
                }
            }
        }
    }
}

@Composable
private fun WeekStrip(
    slots: List<FiatViewModel.WeekSlotUi>,
    selected: String,
    onPick: (String) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        slots.forEach { slot ->
            val done = slot.max > 0 && slot.score >= slot.max
            val isSel = slot.iso == selected
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .clickable { onPick(slot.iso) }
                    .padding(4.dp),
            ) {
                Text(slot.label, style = MaterialTheme.typography.labelSmall, color = TextMuted)
                Text(
                    "${slot.score}/${slot.max}",
                    style = MaterialTheme.typography.labelMedium,
                    color = when {
                        isSel -> Gold
                        done -> SacredGreen
                        else -> Parchment.copy(alpha = 0.7f)
                    },
                )
            }
        }
    }
}

@Composable
private fun SectionCard(
    section: FiatSection,
    entry: com.dailycatholic.app.domain.DailyEntry,
    onToggle: (String) -> Unit,
    onMedia: (FiatCheck) -> Unit,
) {
    val done = section.checks.count { entry.getCheck(it.key) }
    val total = section.checks.size
    val allDone = total > 0 && done == total
    val allBonus = section.checks.isNotEmpty() && section.checks.all { it.bonus }
    val secColor = Color(android.graphics.Color.parseColor(section.colorHex))
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                BorderStroke(1.dp, if (allDone) secColor.copy(alpha = 0.5f) else AppBorderGold.copy(alpha = 0.35f)),
                RoundedCornerShape(12.dp),
            )
            .background(
                if (allDone) secColor.copy(alpha = 0.08f) else AppSurface,
                RoundedCornerShape(12.dp),
            )
            .padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(section.icon, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(end = 8.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        section.title,
                        style = MaterialTheme.typography.titleMedium,
                        color = if (allDone) secColor else Parchment,
                    )
                    if (allBonus) {
                        Text(
                            " ✦ BONUS",
                            style = MaterialTheme.typography.labelSmall,
                            color = Gold,
                            modifier = Modifier.padding(start = 6.dp),
                        )
                    }
                }
                Text(
                    if (allBonus) "Optional · Bonus points" else section.subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = TextMuted,
                )
            }
            Text(
                "$done/$total${if (allDone) " ✓" else ""}",
                style = MaterialTheme.typography.labelMedium,
                color = if (allDone) secColor else TextMuted,
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        section.checks.forEach { check ->
            CheckRow(
                check = check,
                checked = entry.getCheck(check.key),
                accent = if (check.bonus) Gold else secColor,
                onToggle = { onToggle(check.key) },
                onOpenMedia = { onMedia(check) },
            )
        }
    }
}

@Composable
private fun CheckRow(
    check: FiatCheck,
    checked: Boolean,
    accent: Color,
    onToggle: () -> Unit,
    onOpenMedia: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .clickable(onClick = onToggle),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(26.dp)
                    .border(1.dp, if (checked) accent else TextMuted.copy(alpha = 0.4f), RoundedCornerShape(6.dp))
                    .background(if (checked) accent.copy(alpha = 0.13f) else Color.Transparent, RoundedCornerShape(6.dp)),
                contentAlignment = Alignment.Center,
            ) {
                if (checked) {
                    Text("✓", color = accent, style = MaterialTheme.typography.bodyMedium)
                }
            }
            Spacer(modifier = Modifier.width(10.dp))
            Column {
                Text(
                    check.label,
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (checked) Parchment else TextMuted,
                )
                Row {
                    if (check.required) {
                        Text("Required", style = MaterialTheme.typography.labelSmall, color = SacredCopperCompat())
                    }
                    if (check.bonus) {
                        Text(
                            "✦ Bonus",
                            style = MaterialTheme.typography.labelSmall,
                            color = Gold,
                            modifier = Modifier.padding(start = 6.dp),
                        )
                    }
                }
            }
        }
        if (check.media != null) {
            Text(
                "▶",
                style = MaterialTheme.typography.labelLarge,
                color = Gold,
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .clickable(onClick = onOpenMedia)
                    .padding(8.dp),
            )
        }
    }
}

@Composable
private fun SacredCopperCompat(): Color = Color(0xFFB87333)
